const { app, BrowserWindow, ipcMain, net } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');

const VOICEVOX_API_URL = 'http://localhost:50021';
const OUTPUT_DIR = path.join(app.getAppPath(), 'output');

// --- Helper Functions ---
const ensureOutputDir = async () => {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  } catch (error) {
    console.error('Could not create output directory', error);
  }
};

const createSilentWav = async (filePath, durationSeconds) => {
  const sampleRate = 24000;
  const bitDepth = 16;
  const numChannels = 1;
  const numSamples = Math.round(sampleRate * durationSeconds);
  const blockAlign = numChannels * (bitDepth / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4); // file size - 8
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // subchunk size
  buffer.writeUInt16LE(1, 20); // audio format (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitDepth, 34);

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // The rest of the buffer is already filled with zeros (silence)
  await fs.writeFile(filePath, buffer);
};


// --- IPC Handlers ---
ipcMain.handle('get-characters', () => {
  return new Promise((resolve, reject) => {
    const request = net.request({ url: `${VOICEVOX_API_URL}/speakers` });
    let body = '';
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP status code: ${response.statusCode}`));
      }
      response.on('data', (chunk) => { body += chunk.toString(); });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
      response.on('error', (err) => reject(err));
    });
    request.on('error', (err) => reject(err));
    request.end();
  }).catch(err => {
    console.error('Failed to fetch characters:', err);
    return null;
  });
});

ipcMain.handle('generate-audio', async (event, { text, speakerIds, interval, filename, speakerNames, prependName }) => {
  await ensureOutputDir();
  const tempFiles = [];
  const finalAudioFiles = [];
  const totalSpeakers = speakerIds.length;
  const totalSteps = totalSpeakers * (prependName ? 3 : 1) + 1; // 1 for final concat
  let currentStep = 0;

  const sendProgress = (status) => {
    currentStep++;
    const progress = Math.round((currentStep / totalSteps) * 100);
    event.sender.send('progress-update', { progress, status });
  };

  const postRequest = (url, data, responseType = 'json') => {
    return new Promise((resolve, reject) => {
      const request = net.request({ method: 'POST', url });
      request.setHeader('Content-Type', 'application/json');
      request.on('response', (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          if (response.statusCode !== 200) { return reject(new Error(`API Error: ${response.statusCode} - ${buffer.toString()}`)) }
          if (responseType === 'json') { resolve(JSON.parse(buffer.toString())); } else { resolve(buffer); }
        });
        response.on('error', reject);
      });
      request.on('error', reject);
      if (data) { request.write(JSON.stringify(data)); }
      request.end();
    });
  };

  try {
    event.sender.send('progress-update', { progress: 0, status: '音声生成を開始します...' });

    for (let i = 0; i < totalSpeakers; i++) {
      const speakerId = speakerIds[i];
      const speakerName = speakerNames[i] || `ID:${speakerId}`;
      
      let speakerFinalAudioPath;

      if (prependName) {
        // 1. Generate name audio
        sendProgress(`[${i + 1}/${totalSpeakers}] ${speakerName}の名前を生成中...`);
        const nameQuery = await postRequest(`${VOICEVOX_API_URL}/audio_query?speaker=${speakerId}&text=${encodeURIComponent(speakerName)}`);
        const nameWav = await postRequest(`${VOICEVOX_API_URL}/synthesis?speaker=${speakerId}`, nameQuery, 'buffer');
        const namePath = path.join(OUTPUT_DIR, `temp_name_${speakerId}_${Date.now()}.wav`);
        await fs.writeFile(namePath, nameWav);
        tempFiles.push(namePath);

        // 2. Generate 1s silence
        const silencePath = path.join(OUTPUT_DIR, `temp_silence_1s_${Date.now()}.wav`);
        await createSilentWav(silencePath, 1);
        tempFiles.push(silencePath);

        // 3. Generate text audio
        sendProgress(`[${i + 1}/${totalSpeakers}] ${speakerName}のセリフを生成中...`);
        const textQuery = await postRequest(`${VOICEVOX_API_URL}/audio_query?speaker=${speakerId}&text=${encodeURIComponent(text)}`);
        const textWav = await postRequest(`${VOICEVOX_API_URL}/synthesis?speaker=${speakerId}`, textQuery, 'buffer');
        const textPath = path.join(OUTPUT_DIR, `temp_text_${speakerId}_${Date.now()}.wav`);
        await fs.writeFile(textPath, textWav);
        tempFiles.push(textPath);

        // 4. Concat name + silence + text
        sendProgress(`[${i + 1}/${totalSpeakers}] ${speakerName}の音声を結合中...`);
        const speakerConcatListPath = path.join(OUTPUT_DIR, `concat_speaker_${i}.txt`);
       const concatContent = `file '${namePath.replace(/\\/g, '/')}'\nfile '${silencePath.replace(/\\/g, '/')}'\nfile '${textPath.replace(/\\/g, '/')}'`;
 await fs.writeFile(speakerConcatListPath, concatContent);
        tempFiles.push(speakerConcatListPath);

        speakerFinalAudioPath = path.join(OUTPUT_DIR, `final_speaker_${i}.wav`);
        await new Promise((resolve, reject) => {
          ffmpeg().input(speakerConcatListPath).inputOptions(['-f concat', '-safe 0']).output(speakerFinalAudioPath).on('end', resolve).on('error', reject).run();
        });
        tempFiles.push(speakerFinalAudioPath);

      } else {
        sendProgress(`[${i + 1}/${totalSpeakers}] ${speakerName}の音声を生成中...`);
        const audioQuery = await postRequest(`${VOICEVOX_API_URL}/audio_query?speaker=${speakerId}&text=${encodeURIComponent(text)}`);
        const wavBuffer = await postRequest(`${VOICEVOX_API_URL}/synthesis?speaker=${speakerId}`, audioQuery, 'buffer');
        speakerFinalAudioPath = path.join(OUTPUT_DIR, `temp_audio_${speakerId}_${Date.now()}.wav`);
        await fs.writeFile(speakerFinalAudioPath, wavBuffer);
        tempFiles.push(speakerFinalAudioPath);
      }
      finalAudioFiles.push(speakerFinalAudioPath);
    }

    if (finalAudioFiles.length === 0) throw new Error('No audio files were generated.');

    const outputPath = path.join(OUTPUT_DIR, `${filename}.mp3`);
    sendProgress('最終ファイルを結合・変換中...');

    if (finalAudioFiles.length === 1) {
      await new Promise((resolve, reject) => {
        ffmpeg(finalAudioFiles[0]).audioCodec('libmp3lame').on('error', reject).on('end', resolve).save(outputPath);
      });
    } else {
      const concatListPath = path.join(OUTPUT_DIR, `concat_final.txt`);
      tempFiles.push(concatListPath);
      let concatContent = '';

      if (interval > 0) {
        const intervalSilencePath = path.join(OUTPUT_DIR, `silence_interval_${interval}s.wav`);
        await createSilentWav(intervalSilencePath, interval);
        tempFiles.push(intervalSilencePath);
       concatContent = finalAudioFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join(`\nfile '${intervalSilencePath.replace(/\\/g, '/')}'\n`);
 } else {
        concatContent = finalAudioFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join(`\nfile '${intervalSilencePath.replace(/\\/g, '/')}'\n`);
     }
      await fs.writeFile(concatListPath, concatContent);
      await new Promise((resolve, reject) => {
        ffmpeg().input(concatListPath).inputOptions(['-f concat', '-safe 0']).outputOptions('-c:a libmp3lame').on('error', reject).on('end', resolve).save(outputPath);
      });
    }
    
    event.sender.send('progress-update', { progress: 100, status: `生成完了: ${outputPath}` });
    return outputPath;

  } catch (error) {
    console.error('Audio generation failed:', error);
    event.sender.send('progress-update', { progress: 100, status: `エラー: ${error.message}` });
    throw error;
  } finally {
    for (const file of tempFiles) {
      try { await fs.unlink(file); } catch (e) { console.warn(`Failed to delete temp file: ${e.message}`); }
    }
  }
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // preloadスクリプトを後で作成
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // WebpackでビルドされたHTMLをロード
  mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));


  // 開発者ツールを開く
  //mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// ここに後ほどAPI関連のIPCハンドラを追加する
