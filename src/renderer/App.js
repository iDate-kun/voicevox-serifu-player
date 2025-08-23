import React, { useState, useEffect, useRef } from 'react';

// --- キャラクターメタデータ ---
const characterMeta = {
  '四国めたん': { gender: '女性', color: '#FF6F61', isTohoku: true },
  'ずんだもん': { gender: 'その他', color: '#6ABD45', isTohoku: true },
  '春日部つむぎ': { gender: '女性', color: '#FFC93C', isTohoku: false },
  '雨晴はう': { gender: '女性', color: '#4A90E2', isTohoku: false },
  '波音リツ': { gender: '女性', color: '#FF7F50', isTohoku: false },
  '玄野武宏': { gender: '男性', color: '#8B4513', isTohoku: false },
  '白上虎太郎': { gender: '男性', color: '#FFFFFF', isTohoku: false },
  '青山龍星': { gender: '男性', color: '#1E90FF', isTohoku: false },
  '冥鳴ひまり': { gender: '女性', color: '#800080', isTohoku: false },
  '九州そら': { gender: '女性', color: '#00CED1', isTohoku: true },
  'もち子さん': { gender: '女性', color: '#F4A460', isTohoku: false },
  '剣崎雌雄': { gender: '男性', color: '#4682B4', isTohoku: false },
  'WhiteCUL': { gender: '女性', color: '#E0E0E0', isTohoku: false },
  'No.7': { gender: '女性', color: '#FF69B4', isTohoku: false },
  'ちび式じい': { gender: '男性', color: '#696969', isTohoku: false },
  '櫻歌ミコ': { gender: '女性', color: '#FFB6C1', isTohoku: false },
  '小夜/SAYO': { gender: '女性', color: '#2F4F4F', isTohoku: false },
  'ナースロボ＿タイプＴ': { gender: '女性', color: '#40E0D0', isTohoku: false },
  '†聖騎士 紅桜†': { gender: '男性', color: '#B22222', isTohoku: false },
  '雀松朱司': { gender: '男性', color: '#DAA520', isTohoku: false },
  '麒ヶ島宗麟': { gender: '男性', color: '#556B2F', isTohoku: false },
  '春歌ナナ': { gender: '女性', color: '#FFB347', isTohoku: false },
  '猫使アル': { gender: '女性', color: '#D2691E', isTohoku: false },
  '猫使ビィ': { gender: '女性', color: '#CD5C5C', isTohoku: false },
  '中国うさぎ': { gender: '女性', color: '#FF8C00', isTohoku: true },
  '栗田まろん': { gender: '男性', color: '#8B4513', isTohoku: false },
  'あいえるたん': { gender: '女性', color: '#FF69B4', isTohoku: false },
  '満別花丸': { gender: 'その他', color: '#FFD700', isTohoku: false },
  '琴詠ニア': { gender: '女性', color: '#9370DB', isTohoku: false },
  'Voidoll': { gender: 'その他', color: '#708090', isTohoku: false },
  'ぞん子': { gender: '女性', color: '#DC143C', isTohoku: false },
  '中部つるぎ': { gender: '女性', color: '#7B68EE', isTohoku: true },
  '離途': { gender: '男性', color: '#2E8B57', isTohoku: false },
  '黒沢冴白': { gender: '男性', color: '#000000', isTohoku: false },
  'ユーレイちゃん': { gender: '女性', color: '#B0C4DE', isTohoku: false },
  '東北ずん子': { gender: '女性', color: '#32CD32', isTohoku: true },
  '東北きりたん': { gender: '女性', color: '#228B22', isTohoku: true },
  '東北イタコ': { gender: '女性', color: '#800000', isTohoku: true },
};

const GENDERS = {
  All: 'すべて',
  Female: '女性',
  Male: '男性',
  Other: 'その他',
};

// --- パス→file:// URL 変換（Windows対応含む） ---
const toFileUrl = (p) => {
  const normalized = String(p).replace(/\\/g, '/'); // \ -> /
  const withDrive = /^[A-Za-z]:/.test(normalized) ? `/${normalized}` : normalized; // C: なら / を付与
  return `file://${withDrive}`;
};

/**
 * メインUIコンポーネント。
 * - キャラクター・スタイルのフィルタ／選択
 * - 音声生成のトリガーと進捗表示
 * - プレビュー音声の再生
 */
function App() {
  // --- State管理 ---
  const [allCharacters, setAllCharacters] = useState([]);
  const [displayedCharacters, setDisplayedCharacters] = useState([]);
  const [status, setStatus] = useState('準備完了');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [text, setText] = useState('このアプリは、同じセリフを異なるキャラで比較・聴き比べることを主目的とします。');
  const [selectedStyles, setSelectedStyles] = useState(new Set());
  const [interval, setInterval] = useState(1);
  const [autoplay, setAutoplay] = useState(true);
  const [prependName, setPrependName] = useState(true);
  const [audioSrc, setAudioSrc] = useState(null);
  const [genderFilter, setGenderFilter] = useState('すべて');
  const [showTohokuOnly, setShowTohokuOnly] = useState(false);
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [isMultiStyleMode, setIsMultiStyleMode] = useState(false);
  const [expandedSpeakers, setExpandedSpeakers] = useState(new Set());
  const [favorites, setFavorites] = useState(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewFilesExist, setPreviewFilesExist] = useState(false);
  const [generatingPreviews, setGeneratingPreviews] = useState(false);

  const audioRef = useRef(null);
  const previewAudioRef = useRef(null);
  const isInitialMount = useRef(true);

  // --- 副作用 ---
  useEffect(() => {
    const fetchCharactersAndFavorites = async () => {
      setStatus('キャラクターと設定を読み込んでいます...');
      try {
        const [speakerData, loadedFavorites, previewsExist] = await Promise.all([
          window.electronAPI.getCharacters(),
          window.electronAPI.loadFavorites(),
          window.electronAPI.checkPreviewFiles(),
        ]);

        if (speakerData) {
          const characters = speakerData.map((speaker) => {
            const charMeta = characterMeta[speaker.name] || { gender: 'N/A', color: '#FFFFFF', isTohoku: false };
            return {
              ...speaker,
              ...charMeta,
              styles: speaker.styles.map((style) => ({
                ...style,
                speakerName: speaker.name,
                speaker_uuid: speaker.speaker_uuid,
                ...charMeta,
              })),
            };
          });
          setAllCharacters(characters);
        }

        if (loadedFavorites) {
          setFavorites(new Set(loadedFavorites));
        }

        setPreviewFilesExist(previewsExist);
        setStatus('読み込み完了');
      } catch (error) {
        console.error(error);
        setStatus(`エラー: ${error.message}`);
      }
    };

    fetchCharactersAndFavorites();

    const handleProgress = ({ progress, status }) => {
      setProgress(progress);
      setStatus(status);
    };

    const cleanup = window.electronAPI.onProgressUpdate(handleProgress);
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  useEffect(() => {
    const filtered = allCharacters.filter((char) => {
      const genderMatch = genderFilter === 'すべて' || char.gender === genderFilter;
      const tohokuMatch = !showTohokuOnly || char.isTohoku;
      const selectedMatch = !showSelectedOnly || char.styles.some((style) => selectedStyles.has(style.id));
      const favoritesMatch = !showFavoritesOnly || favorites.has(char.speaker_uuid);
      const searchMatch = !searchQuery || char.name.toLowerCase().includes(searchQuery.toLowerCase());
      return genderMatch && tohokuMatch && selectedMatch && favoritesMatch && searchMatch;
    });
    setDisplayedCharacters(filtered);
  }, [allCharacters, genderFilter, showTohokuOnly, showSelectedOnly, selectedStyles, favorites, showFavoritesOnly, searchQuery]);

  useEffect(() => {
    if (audioSrc && audioRef.current && autoplay) {
      audioRef.current.play().catch((e) => console.error('自動再生に失敗しました', e));
    }
  }, [audioSrc, autoplay]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      window.electronAPI.saveFavorites(Array.from(favorites));
    }
  }, [favorites]);

  // --- イベントハンドラ ---
  /**
   * 生成済みのプレビューファイル（name/test/amenbo）を選択して再生する。
   * @param {string} characterName キャラクター名
   * @param {('name'|'test'|'amenbo')} type プレビュー種別
   */
  const handlePreview = async (characterName, type) => {
    const sanitize = (name) => name.replace(/[\/:*?"<>|]/g, '_');

    const previewTexts = {
      name: `${characterName}です。`,
      test: 'テストです',
      amenbo: 'あめんぼあかいなあいうえお',
    };

    const text = previewTexts[type];
    // メインプロセス側の生成規則と合わせ、全文をサニタイズしてファイル名化
    const fileName = `${sanitize(characterName)}_${sanitize(text)}.mp3`;

    try {
      const basePath = await window.electronAPI.getPreviewAssetPath(); // Promise想定
      const fsPath = `${String(basePath).replace(/\\/g, '/')}/${fileName}`;
      const audioPath = toFileUrl(fsPath);
      if (previewAudioRef.current) {
        previewAudioRef.current.src = audioPath;
        await previewAudioRef.current.play();
      }
    } catch (e) {
      console.error('プレビュー再生に失敗', e);
      setStatus(`プレビューファイルが見つかりません: ${fileName}`);
    }
  };

  /**
   * 未生成のプレビュー音声をまとめて生成する。
   */
  const handleGeneratePreviews = async () => {
    setGeneratingPreviews(true);
    setStatus('プレビュー音声を生成中...');
    try {
      await window.electronAPI.generatePreviewFiles();
      setPreviewFilesExist(true);
      setStatus('プレビュー音声の生成が完了しました。');
    } catch (error) {
      console.error('プレビュー音声の生成に失敗しました:', error);
      setStatus(`エラー: ${error.message}`);
    } finally {
      setGeneratingPreviews(false);
    }
  };

  /**
   * お気に入り（speaker_uuid単位）をトグルする。
   * @param {string} speakerUuid スピーカーUUID
   */
  const handleToggleFavorite = (speakerUuid) => {
    const newFavorites = new Set(favorites);
    if (newFavorites.has(speakerUuid)) {
      newFavorites.delete(speakerUuid);
    } else {
      newFavorites.add(speakerUuid);
    }
    setFavorites(newFavorites);
  };

  /**
   * スタイルIDを選択/解除する。
   * @param {number} styleId VOICEVOXスタイルID
   */
  const handleStyleSelection = (styleId) => {
    const newSelection = new Set(selectedStyles);
    if (newSelection.has(styleId)) {
      newSelection.delete(styleId);
    } else {
      newSelection.add(styleId);
    }
    setSelectedStyles(newSelection);
  };

  /**
   * 指定キャラクター配下の全スタイルを一括選択/解除する。
   * @param {object} char キャラクター（styles配列含む）
   * @param {boolean} shouldSelect 選択（true）/解除（false）
   */
  const handleSelectAllStyles = (char, shouldSelect) => {
    const newSelection = new Set(selectedStyles);
    char.styles.forEach((style) => {
      if (shouldSelect) {
        newSelection.add(style.id);
      } else {
        newSelection.delete(style.id);
      }
    });
    setSelectedStyles(newSelection);
  };

  /**
   * キャラクターのスタイル一覧の開閉を切り替える。
   * @param {string} speakerUuid スピーカーUUID
   */
  const toggleSpeakerExpansion = (speakerUuid) => {
    const newExpansion = new Set(expandedSpeakers);
    if (newExpansion.has(speakerUuid)) {
      newExpansion.delete(speakerUuid);
    } else {
      newExpansion.add(speakerUuid);
    }
    setExpandedSpeakers(newExpansion);
  };

  /**
   * 表示中のキャラクター（とスタイル）のみ全選択する。
   */
  const handleSelectAllVisible = () => {
    let allVisibleStyleIds;
    if (isMultiStyleMode) {
      allVisibleStyleIds = displayedCharacters.flatMap((char) => char.styles.map((style) => style.id));
    } else {
      allVisibleStyleIds = displayedCharacters.flatMap((char) => {
        const normalStyle = char.styles.find((s) => s.name === 'ノーマル');
        return normalStyle ? [normalStyle.id] : [];
      });
    }
    setSelectedStyles(new Set(allVisibleStyleIds));
  };

  /**
   * すべての選択を解除する。
   */
  const handleDeselectAll = () => {
    setSelectedStyles(new Set());
  };

  /**
   * 選択されたスタイルで音声を生成し、結果のMP3をプレイヤーにセットする。
   */
  const handleGenerate = async () => {
    setLoading(true);
    setProgress(0);
    setAudioSrc(null);

    const speakerIds = Array.from(selectedStyles);
    const speakerNames = speakerIds.map((id) => {
      for (const char of allCharacters) {
        const style = char.styles.find((s) => s.id === id);
        if (style) {
          return isMultiStyleMode ? `${style.speakerName} ${style.name}` : style.speakerName;
        }
      }
      return `ID:${id}`;
    });
    const safeFilename = text.substring(0, 30).replace(/[\/:*?"<>|]/g, '_') || 'output';

    try {
      const outputPath = await window.electronAPI.generateAudio({
        text,
        speakerIds,
        interval, // 数値で保持（下のsliderでNumber化）
        filename: safeFilename,
        speakerNames,
        prependName: prependName,
      });

      setAudioSrc(toFileUrl(outputPath));
    } catch (error) {
      console.error('生成に失敗しました:', error);
    } finally {
      setLoading(false);
    }
  }; // ← セミコロンを忘れない

  /**
   * 現在のモード（ノーマル/マルチスタイル）に応じたキャラクター一覧を描画する。
   */
  const renderCharacterList = () => {
    if (isMultiStyleMode) {
      // スタイル選択モード
      return (
        <ul className="list-group">
          {displayedCharacters.map((char) => {
            const areAllStylesSelected = char.styles.length > 0 && char.styles.every((s) => selectedStyles.has(s.id));
            const headerStyle = {
              backgroundColor: char.color + '99', // 60%
              cursor: 'pointer',
            };

            return (
              <li
                key={char.speaker_uuid}
                className="list-group-item p-0 mb-1"
                style={{ borderRadius: '0.25rem', overflow: 'hidden', border: 'none' }}
              >
                <div
                  className="d-flex justify-content-between align-items-center p-2"
                  style={headerStyle}
                  onClick={() => toggleSpeakerExpansion(char.speaker_uuid)}
                >
                  <div className="d-flex align-items-center">
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFavorite(char.speaker_uuid);
                      }}
                      style={{ cursor: 'pointer', marginRight: '8px' }}
                    >
                      {favorites.has(char.speaker_uuid) ? '★' : '☆'}
                    </span>
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectAllStyles(char, !areAllStylesSelected);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <input className="form-check-input me-2" type="checkbox" checked={areAllStylesSelected} readOnly />
                      <strong>{char.name}</strong>
                    </div>
                  </div>
                  <span>{expandedSpeakers.has(char.speaker_uuid) ? '▲' : '▼'}</span>
                </div>
                {expandedSpeakers.has(char.speaker_uuid) && (
                  <ul className="list-group list-group-flush" style={{ backgroundColor: char.color + '4D' }}>
                    {char.styles.map((style) => {
                      const isSelected = selectedStyles.has(style.id);
                      return (
                        <li key={style.id} className="list-group-item p-0" onClick={() => handleStyleSelection(style.id)}>
                          <label className="d-block w-100 p-2" style={{ cursor: 'pointer' }}>
                            <input className="form-check-input me-2" type="checkbox" checked={isSelected} readOnly />
                            {style.name}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      );
    } else {
      // ノーマルモード
      return (
        <ul className="list-group">
          {displayedCharacters.map((char) => {
            const normalStyle = char.styles.find((s) => s.name === 'ノーマル');
            if (!normalStyle) return null;

            const isSelected = selectedStyles.has(normalStyle.id);
            const itemStyle = {
              backgroundColor: isSelected ? char.color : char.color + '99',
              border: isSelected ? `2px solid #000000` : '1px solid rgba(0,0,0,.125)',
              transition: 'background-color 0.2s ease-in-out, border 0.2s ease-in-out',
            };
            return (
              <li key={char.speaker_uuid} className="list-group-item p-0 d-flex align-items-center" style={itemStyle}>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleFavorite(char.speaker_uuid);
                  }}
                  style={{ cursor: 'pointer', padding: '8px' }}
                >
                  {favorites.has(char.speaker_uuid) ? '★' : '☆'}
                </span>
                <div
                  onClick={() => handleStyleSelection(normalStyle.id)}
                  className="flex-grow-1 d-flex align-items-center p-2"
                  style={{ cursor: 'pointer' }}
                >
                  <input className="form-check-input me-2" type="checkbox" checked={isSelected} readOnly />
                  {char.name} {char.isTohoku && ' (東北)'}
                </div>
                <div className="ms-auto pe-2">
                  <button
                    className="btn btn-sm btn-preview me-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreview(char.name, 'name');
                    }}
                    title={`${char.name}です。`}
                  >
                    ▶
                  </button>
                  <button
                    className="btn btn-sm btn-preview me-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreview(char.name, 'test');
                    }}
                    title="テストです"
                  >
                    ▶
                  </button>
                  <button
                    className="btn btn-sm btn-preview"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreview(char.name, 'amenbo');
                    }}
                    title="あめんぼあかいなあいうえお"
                  >
                    ▶
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      );
    }
  };

  return (
    <div className="container-fluid d-flex flex-column p-3">
      <header className="mb-3 d-flex justify-content-between align-items-baseline">
        <h1>Voicevoxセリフプレイヤー</h1>
        <small className="text-muted">このアプリは全画面でのご利用を推奨します。</small>
      </header>
      <div className="row flex-grow-1 gx-3">
        <div className="col-md-4 d-flex flex-column">
          <div className="card flex-grow-1">
            <div className="card-body d-flex flex-column">
              <h5 className="card-title">設定</h5>
              <div className="mb-3">
                <label htmlFor="text-input" className="form-label">
                  セリフ
                </label>
                <textarea
                  id="text-input"
                  className="form-control"
                  rows="4"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                ></textarea>
              </div>
              <div className="row mb-3">
                <div className="col">
                  <label className="form-label">性別</label>
                  {Object.entries(GENDERS).map(([key, value]) => (
                    <div className="form-check" key={key}>
                      <input
                        className="form-check-input"
                        type="radio"
                        name="gender"
                        id={`gender-${key}`}
                        checked={genderFilter === value}
                        onChange={() => setGenderFilter(value)}
                      />
                      <label className="form-check-label" htmlFor={`gender-${key}`}>
                        {value}
                      </label>
                    </div>
                  ))}
                </div>
                <div className="col">
                  <label className="form-label">グループ</label>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="tohoku-filter"
                      checked={showTohokuOnly}
                      onChange={(e) => setShowTohokuOnly(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="tohoku-filter">
                      東北プロジェクトのみ
                    </label>
                  </div>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="selected-filter"
                      checked={showSelectedOnly}
                      onChange={(e) => setShowSelectedOnly(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="selected-filter">
                      選択済みのみ
                    </label>
                  </div>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="favorites-filter"
                      checked={showFavoritesOnly}
                      onChange={(e) => setShowFavoritesOnly(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="favorites-filter">
                      お気に入りのみ
                    </label>
                  </div>
                </div>
              </div>
              <div className="mb-3">
                <label htmlFor="interval-slider" className="form-label">
                  音声間の間隔: {interval}秒
                </label>
                <input
                  type="range"
                  className="form-range"
                  min="0"
                  max="5"
                  step="0.1"
                  id="interval-slider"
                  value={interval}
                  onChange={(e) => setInterval(Number(e.target.value))} // 数値化
                />
              </div>
              <div className="border-top pt-3 mb-3">
                <button
                  className="btn btn-info w-100"
                  onClick={handleGeneratePreviews}
                  disabled={generatingPreviews || previewFilesExist}
                >
                  {generatingPreviews ? '生成中...' : previewFilesExist ? 'プレビュー音声は生成済みです' : 'プレビュー音声を生成'}
                </button>
              </div>
              <div className="mt-auto pt-3 border-top">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      id="prepend-name-switch"
                      checked={prependName}
                      onChange={(e) => setPrependName(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="prepend-name-switch">
                      話者名を読み上げる
                    </label>
                  </div>
                  <div className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      id="autoplay-switch"
                      checked={autoplay}
                      onChange={(e) => setAutoplay(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="autoplay-switch">
                      自動再生
                    </label>
                  </div>
                </div>
                <button
                  className="btn btn-primary w-100"
                  onClick={handleGenerate}
                  disabled={loading || text.trim() === '' || selectedStyles.size === 0}
                >
                  {loading ? `生成中... (${progress}%)` : `音声生成 (${selectedStyles.size}スタイル選択中)`}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-8 d-flex flex-column">
          <div className="card flex-grow-1">
            <div className="card-body d-flex flex-column">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h5 className="card-title mb-0">キャラクター ({displayedCharacters.length}人)</h5>
                <div className="d-flex align-items-center">
                  <button className="btn btn-sm btn-outline-secondary me-2" onClick={handleSelectAllVisible}>
                    すべて選択
                  </button>
                  <button className="btn btn-sm btn-outline-secondary me-3" onClick={handleDeselectAll}>
                    すべて解除
                  </button>
                  <div className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      id="style-mode-switch"
                      checked={isMultiStyleMode}
                      onChange={(e) => setIsMultiStyleMode(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="style-mode-switch">
                      スタイル選択
                    </label>
                  </div>
                </div>
              </div>
              <div className="mb-3">
                <input
                  type="text"
                  className="form-control"
                  placeholder="キャラクター名で検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="overflow-auto flex-grow-1">
                {displayedCharacters.length > 0 ? renderCharacterList() : <p>{allCharacters.length > 0 ? 'フィルターに一致するキャラクターがいません。' : status}</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
      <footer className="mt-3">
        <div className="alert alert-info" role="alert">
          ステータス: {status}
        </div>
        {loading && (
          <div className="progress" style={{ height: '20px' }}>
            <div
              className="progress-bar progress-bar-striped progress-bar-animated"
              role="progressbar"
              style={{ width: `${progress}%` }}
              aria-valuenow={progress}
              aria-valuemin="0"
              aria-valuemax="100"
            >
              {progress}%
            </div>
          </div>
        )}
        {audioSrc && !loading && <audio ref={audioRef} src={audioSrc} controls className="w-100 mt-2" />}
        <audio ref={previewAudioRef} style={{ display: 'none' }} />
      </footer>
    </div>
  );
}

export default App;
