const { app, BrowserWindow, ipcMain, net } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const ffs = require('fs');
const ffmpeg = require('fluent-ffmpeg');

const VOICEVOX_API_URL = 'http://localhost:50021';
const isDev = !app.isPackaged;

const getAssetPath = (...subPaths) => {
  return isDev
    ? path.join(__dirname, '../../', ...subPaths)
    : path.join(process.resourcesPath, ...subPaths);
};

const USER_DATA_PATH = app.getPath('userData');
const OUTPUT_DIR = path.join(USER_DATA_PATH, 'output');
const PREVIEW_DIR = path.join(__dirname, '..', '..', 'preview');
const FAVORITES_PATH = path.join(USER_DATA_PATH, 'favorites.json');

// --- Helper Functions ---
const ensureDir = async (dir) => {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    console.error(`Could not create directory ${dir}`, error);
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

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitDepth, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  await fs.writeFile(filePath, buffer);
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
        if (response.statusCode !== 200) {
          return reject(new Error(`API Error: ${response.statusCode} - ${buffer.toString()}`));
        }
        if (responseType === 'json') {
          resolve(JSON.parse(buffer.toString()));
        } else {
          resolve(buffer);
        }
      });
      response.on('error', reject);
    });
    request.on('error', reject);
    if (data) { request.write(JSON.stringify(data)); }
    request.end();
  });
};

const getRequestJson = (url) => {
  return new Promise((resolve, reject) => {
    const request = net.request({ method: 'GET', url });
    request.on('response', (response) => {
      let body = '';
      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP status code: ${response.statusCode}`));
      }
      response.on('data', (chunk) => { body += chunk.toString(); });
      response.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
      response.on('error', (err) => reject(err));
    });
    request.on('error', (err) => reject(err));
    request.end();
  });
};

const sanitizeFilename = (name) => name.replace(/[\/:*?"<>|]/g, '_');
const fslash = (p) => p.replace(/\\/g, '/'); // Windowsの\→/ 正規化

// --- Characters fetcher (再利用用) ---
async function fetchCharacters() {
  try {
    const data = await getRequestJson(`${VOICEVOX_API_URL}/speakers`);
    return data;
  } catch (err) {
    console.error('Failed to fetch characters:', err);
    return null;
  }
}

// --- IPC Handlers ---
ipcMain.handle('get-characters', async () => {
  return await fetchCharacters();
});

ipcMain.handle('generate-audio', async (event, { text, speakerIds, interval, filename, speakerNames, prependName }) => {
  await ensureDir(OUTPUT_DIR);
  const tempFiles = [];
  const finalAudioFiles = [];
  const totalSpeakers = speakerIds.length;
  const totalSteps = totalSpeakers * (prependName ? 3 : 1) + 1;
  let currentStep = 0;

  const sendProgress = (status) => {
    currentStep++;
    const progress = Math.round((currentStep / totalSteps) * 100);
    event.sender.send('progress-update', { progress, status });
  };

  try {
    event.sender.send('progress-update', { progress: 0, status: '音声生成を開始します...' });

    for (let i = 0; i < totalSpeakers; i++) {
      const speakerId = speakerIds[i];
      const speakerName = speakerNames[i] || `ID:${speakerId}`;
      let speakerFinalAudioPath;

      if (prependName) {
        sendProgress(`[${i + 1}/${totalSpeakers}] ${speakerName}の名前を生成中...`);
        const nameQuery = await postRequest(`${VOICEVOX_API_URL}/audio_query?speaker=${speakerId}&text=${encodeURIComponent(speakerName)}`);
        const nameWav = await postRequest(`${VOICEVOX_API_URL}/synthesis?speaker=${speakerId}`, nameQuery, 'buffer');
        const namePath = path.join(OUTPUT_DIR, `temp_name_${speakerId}_${Date.now()}.wav`);
        await fs.writeFile(namePath, nameWav);
        tempFiles.push(namePath);

        const silencePath = path.join(OUTPUT_DIR, `temp_silence_1s_${Date.now()}.wav`);
        await createSilentWav(silencePath, 1);
        tempFiles.push(silencePath);

        sendProgress(`[${i + 1}/${totalSpeakers}] ${speakerName}のセリフを生成中...`);
        const textQuery = await postRequest(`${VOICEVOX_API_URL}/audio_query?speaker=${speakerId}&text=${encodeURIComponent(text)}`);
        const textWav = await postRequest(`${VOICEVOX_API_URL}/synthesis?speaker=${speakerId}`, textQuery, 'buffer');
        const textPath = path.join(OUTPUT_DIR, `temp_text_${speakerId}_${Date.now()}.wav`);
        await fs.writeFile(textPath, textWav);
        tempFiles.push(textPath);

        sendProgress(`[${i + 1}/${totalSpeakers}] ${speakerName}の音声を結合中...`);
        const speakerConcatListPath = path.join(OUTPUT_DIR, `concat_speaker_${i}.txt`);
        const concatContent =
          `file '${fslash(namePath)}'\n` +
          `file '${fslash(silencePath)}'\n` +
          `file '${fslash(textPath)}'`;
        await fs.writeFile(speakerConcatListPath, concatContent);
        tempFiles.push(speakerConcatListPath);

        speakerFinalAudioPath = path.join(OUTPUT_DIR, `final_speaker_${i}.wav`);
        await new Promise((resolve, reject) => {
          ffmpeg()
            .input(speakerConcatListPath)
            .inputOptions(['-f', 'concat', '-safe', '0'])
            .output(speakerFinalAudioPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
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
        ffmpeg(finalAudioFiles[0])
          .audioCodec('libmp3lame')
          .on('error', reject)
          .on('end', resolve)
          .save(outputPath);
      });
    } else {
      const concatListPath = path.join(OUTPUT_DIR, `concat_final.txt`);
      tempFiles.push(concatListPath);

      let concatContent = '';
      if (interval > 0) {
        const intervalSilencePath = path.join(OUTPUT_DIR, `silence_interval_${interval}s.wav`);
        await createSilentWav(intervalSilencePath, interval);
        tempFiles.push(intervalSilencePath);
        concatContent = finalAudioFiles
          .map(f => `file '${fslash(f)}'`)
          .join(`\nfile '${fslash(intervalSilencePath)}'\n`);
      } else {
        concatContent = finalAudioFiles
          .map(f => `file '${fslash(f)}'`)
          .join('\n');
      }

      await fs.writeFile(concatListPath, concatContent);
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(concatListPath)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions('-c:a libmp3lame')
          .on('error', reject)
          .on('end', resolve)
          .save(outputPath);
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

ipcMain.handle('save-favorites', async (event, favorites) => {
  try {
    await fs.writeFile(FAVORITES_PATH, JSON.stringify(Array.from(favorites)));
  } catch (error) {
    console.error('Failed to save favorites:', error);
  }
});

ipcMain.handle('load-favorites', async () => {
  try {
    const data = await fs.readFile(FAVORITES_PATH);
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    console.error('Failed to load favorites:', error);
    return [];
  }
});

ipcMain.handle('check-preview-files', async () => {
  try {
    await ensureDir(PREVIEW_DIR);
    const files = await fs.readdir(PREVIEW_DIR);
    return files.some(file => file.endsWith('.mp3'));
  } catch (error) {
    console.error('Failed to check preview files:', error);
    return false;
  }
});

ipcMain.handle('get-preview-asset-path', () => {
  // Windowsの\を/に変換して返す
  return fslash(PREVIEW_DIR);
});

ipcMain.handle('generate-preview-files', async (event) => {
  await ensureDir(PREVIEW_DIR);

  const speakers = await fetchCharacters();
  if (!speakers) {
    throw new Error('キャラクターリストの取得に失敗しました。');
  }

  const targetSpeakers = speakers.filter(s => s.styles.some(st => st.name === 'ノーマル'));

  const previewTexts = [
    { type: 'name', text: (name) => `${name}です。` },
    { type: 'test', text: () => 'テストです' },
    { type: 'amenbo', text: () => 'あめんぼあかいなあいうえお' }
  ];

  for (const speaker of targetSpeakers) {
    const normalStyle = speaker.styles.find(s => s.name === 'ノーマル');
    if (!normalStyle) continue;

    for (const pText of previewTexts) {
      const text = pText.text(speaker.name);
      const sanitizedSpeakerName = sanitizeFilename(speaker.name);
      const sanitizedText = sanitizeFilename(text);
      const finalMp3Path = path.join(PREVIEW_DIR, `${sanitizedSpeakerName}_${sanitizedText}.mp3`);

      // 既存はスキップ
      if (ffs.existsSync(finalMp3Path)) {
        console.log(`Skipping existing file: ${finalMp3Path}`);
        continue;
      }

      try {
        event.sender.send('progress-update', { progress: 0, status: `${speaker.name}の「${text}」を生成中...` });
        const audioQuery = await postRequest(`${VOICEVOX_API_URL}/audio_query?speaker=${normalStyle.id}&text=${encodeURIComponent(text)}`);
        const wavBuffer = await postRequest(`${VOICEVOX_API_URL}/synthesis?speaker=${normalStyle.id}`, audioQuery, 'buffer');

        const tempWavPath = path.join(PREVIEW_DIR, `temp_${Date.now()}.wav`);
        await fs.writeFile(tempWavPath, wavBuffer);

        await new Promise((resolve, reject) => {
          ffmpeg(tempWavPath)
            .audioCodec('libmp3lame')
            .on('error', (err) => {
              console.error(`ffmpeg error for ${finalMp3Path}:`, err);
              reject(err);
            })
            .on('end', resolve)
            .save(finalMp3Path);
        });

        await fs.unlink(tempWavPath);

      } catch (error) {
        console.error(`Failed to generate preview for ${speaker.name} - "${text}":`, error);
        // 続行
      }
    }
  }
  event.sender.send('progress-update', { progress: 100, status: 'プレビュー音声の生成が完了しました。' });
  return true;
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: getAssetPath('assets', 'voicevox-serihu-player-icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  } else {
    mainWindow.loadFile(path.join(process.resourcesPath, 'dist', 'index.html'));
  }

  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
