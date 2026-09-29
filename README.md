# 永夜收割 · Nightreap

## 中文

暗黑奇幻 ARPG 割草網頁遊戲：五職業、裝備詞綴、五關卡、四難度與無盡地下城。桌機限定，最低 1280×720。

- 技術：原生 HTML/CSS/JavaScript ES modules，Canvas 2D、SVG、Web Audio、IndexedDB；無框架、CDN 或建置步驟。
- 設計依據：[唯讀原企劃書](永夜收割-Nightreap-企劃書.md)、[實作計畫與核准調整](PLAN.md)、[數值設計](DESIGN.md)、[驗收](ACCEPTANCE.md)。後續明確核准的調整優先於原企劃書對應段落。
- 操作：WASD 移動、滑鼠瞄準、左右鍵施放指定技能、1–6 主動技能、R 終極、Q／E 藥水、Tab 背包、Escape 暫停或關閉面板。
- 網址：https://nightreap.ysgs.app · 倉庫：https://github.com/YuStellarGamesStudio/Nightreap
- 語言：`?lang=en` 或 `?lang=zh`；無參數或無效參數時固定使用英文，不依瀏覽器語言切換。
- 開發規則：依 M0–M7 分階段提交，不自動推送或部署。

### 遊戲玩法

1. **選擇職業**：戰士以怒氣近戰掃蕩；巫師施放元素法術；死靈法師操控屍體與僕從；射手運用箭矢、陷阱與走位；德魯伊在人形、熊形與狼形之間切換。
2. **探索與戰鬥**：使用 WASD 走位、滑鼠瞄準，搭配普攻、六個主動技能與終極技能清除怪群，閃避攻擊並挑戰精英與 Boss。
3. **刷裝與搭配**：拾取白、藍、金、橘四種稀有度的裝備，配置九個裝備槽。利用燃燒、冰凍、中毒等狀態與詞綴形成 build，例如「施加燃燒＋對燃燒敵人增傷」。
4. **回城整備**：出售戰利品、購買消耗品、賭裝與修理裝備；消耗材料重鑄、洗詞綴或升級詞綴。合成可能失敗，但只損失材料，不毀裝備或改動原詞綴。
5. **推進遠征**：探索五關卡、每關三張小地圖，或進入隨機地下城挑戰更深樓層。擊敗第五關最終 Boss「深淵之主」，依序解鎖普通、困難、惡夢、地獄四難度。
6. **尋找隱藏秘境**：在第二關取得綿羊券並找到隱藏傳送門，每次消耗一張券進入綿羊秘境，獲取經驗與裝備，不影響主線進度。
7. **保留成長**：死亡會回城並受到小額懲罰，但不掉裝備。提供五個角色槽、自動存檔及 JSON 匯出／匯入；重新進圖時怪物與 Boss 重生，世界狀態不存檔。

核心循環：**出城探索 → 清怪刷裝 → 搭配詞綴 → 回城整備 → 挑戰 Boss 或更深地下城**。

### 本輪介面與探索

- 開始畫面提供開始／繼續旅程、設定及語言切換；讀檔移入設定，存檔直接保存目前角色。五幕各有獨立村落式庇護所，商人與鍛造僅在城鎮可用。
- 背包按需開啟，每頁依可用高度填滿物品列，裝備以人形九槽呈現；設定可分別指定滑鼠左右鍵技能，下方技能列標示 LMB／RMB。角色與怪物採分件 SVG 步態。
- 背包「一鍵換裝」比較所有頁面的裝備：以各詞綴數值除以該詞綴 T1 上限後加總，換上更高分裝備（含雙戒指）。略過損壞裝備，同分保留原裝；舊裝留在背包並自動存檔。這是通用評分，不替代流派搭配判斷。
- 一鍵換裝固定在背包面板右下角。介面基準字級 16px，裝備／技能名稱與生命數值放大加粗，詞綴詳情 15px；背包加寬、長名稱可顯示兩行，避免靠縮小文字塞版面。
- 背包「出售篩選」另開小視窗，多選稀有度與部位、指定物品等級上限，預覽件數及總價後在庇護所一鍵出售。「自動售出」預設關閉，開啟後新掉落符合條件即換金幣（滿背包也可）；不回頭清空背包、不出售身上裝備，條件隨存檔保存。出售無法復原。
- 網站提供固定英文的 Open Graph／Twitter 分享卡，使用 1200×630 PNG；向量原圖為 `assets/social/nightreap-social.svg`，分享平台相容圖為同名 `.png`。
- 野外與地下城為連續大地圖，包含實體地形障礙、隨機怪群及探索黑霧。
- 怪物死亡後留下依物種繪製的屍體（24 種怪物、綿羊與 5 Boss 各一張），透明化 70% 並保留 30 秒後消失；屍體可作死靈法師召喚骷髏與屍爆的材料。
- 怪物共 25 種（含綿羊）：五幕新增灰骨弓手、墓穴甲蟲、孢霧潛行者、霜翼蝙蝠、虛空巨像，各有獨立造型，分別採遠程、自爆、潛地、飛行、重裝近戰行為，並加入地下城混編；怪物總量不因此增加。
- 上方「截圖」位於背包左側，下載包含當前場景、HUD 與已開背包的 PNG；依本機時間命名 `Nightreap_YYYYMMDD-HHmmss.png`，以裝置像素比例輸出，不上傳圖片。
- 提示各自停留 5 秒，再以 0.5 秒向右滑出並淡出；城鎮或暫停時也會正常消失。

### 安裝與離線

使用 HTTPS 網站或本機 HTTP 伺服器開啟（不可直接開 `file://`）。首次連線等待資產快取完成後，可由支援的桌面瀏覽器選單安裝；之後可離線重新啟動及遊玩。新版本完成快取後顯示「存檔並重新載入」，更新不刪除 IndexedDB。

圖示以 SVG 為來源，提供 16／32／180／192／512 與 maskable 版本；另提供由 SVG 轉製、含 16／32／48px 的根目錄 `favicon.ico`。維護者修改資產後執行 `node scripts/version-assets.mjs`，將內容雜湊與離線清單一起提交；這是發版維護工具，遊戲直接執行已提交檔案，不需建置。

背景音樂共 20 首：五幕各三首，分別對應每幕三張小地圖；主選單、庇護所、地下城、Boss 戰及綿羊秘境各一首。Boss 等特殊場景優先選曲，Boss 擊敗後回到小地圖配樂。每首獨立存於 `src/data/music/{scene}.json`，索引列場景檔名，`src/data/audio.js` 的 `ACT_MUSIC` 提供地圖映射；新增曲目後更新索引、映射及資產雜湊，全部曲目納入離線快取。

美術目錄位於 `assets/`：`characters/` 五職人物、`creatures/` 怪物／召喚物／變身、`corpses/` 怪物屍體、`terrain/` 地形圖集、`sanctuaries/` 五村、`ui/` 技能與裝備、`icons/` 網站圖示、`scenes/` 開始場景、`social/` 分享圖。人物映射集中在 `src/data/config.js` 的 `ART`；地形圖集依 `data-terrain` 分組，不拆成每障礙一檔。


### 開發狀態

遊戲介面已整合核心、戰鬥、裝備、世界、存檔、音訊及 PWA，並有局部瀏覽器驗證。尚未完成五職業普通全通、300 敵人＋12 僕從效能、全部詞綴效果及掉落分布等完整驗收；原有部分怪物仍共用族裔造型，新增五種各有獨立 SVG。功能存在不代表整項驗收通過，最新證據與缺口見 [ACCEPTANCE.md](ACCEPTANCE.md)。

## English

A desktop dark-fantasy survivor ARPG featuring five classes, affix-driven loot, five acts, four difficulties, and endless dungeons. Minimum viewport: 1280×720.

- Native HTML/CSS/JavaScript ES modules, Canvas 2D, SVG, Web Audio, and IndexedDB. No framework, CDN, or build step.
- Controls: WASD to move, mouse to aim, left/right mouse buttons for assigned skills, 1–6 for active skills, R for ultimate, Q/E for potions, Tab for inventory, and Escape to pause or close a panel.
- Languages: `?lang=en` / `?lang=zh`; missing or unsupported parameters default to English, regardless of browser language.
- Project: https://nightreap.ysgs.app · Repository: https://github.com/YuStellarGamesStudio/Nightreap
- Development proceeds through M0–M7 with local milestone commits. No automated push or deployment.

### How to play

1. **Choose a class:** Sweep through enemies with the Warrior's rage-fueled melee attacks, cast elemental spells as the Wizard, command corpses and minions as the Necromancer, combine arrows and traps with evasive movement as the Ranger, or switch between human, bear, and wolf forms as the Druid.
2. **Explore and fight:** Move with WASD and aim with the mouse. Combine basic attacks, six active skills, and an ultimate to clear crowds, dodge attacks, and challenge elites and bosses.
3. **Collect loot and shape your build:** Equip nine slots with common (white), magic (blue), rare (gold), and legendary (orange) gear. Combine affixes with effects such as burning, freezing, and poison—for example, applying burning and dealing extra damage to burning enemies.
4. **Prepare in town:** Sell loot, buy consumables, gamble for gear, and repair equipment. Spend materials to replace an affix, reroll its value, or upgrade its tier. Failed crafting consumes materials but never destroys gear or changes its existing affixes.
5. **Advance your journey:** Explore five acts with three maps each, or descend through increasingly deep procedural dungeons. Defeat the final boss, the Abyss Lord, in Act V to unlock successive difficulties: Normal, Hard, Nightmare, and Hell.
6. **Find the hidden realm:** Obtain a sheep ticket in Act II and locate the hidden portal. Each visit consumes one ticket and offers experience and loot without affecting campaign progression.
7. **Keep your progress:** Death returns you to town with a small penalty, but you keep your equipment. Five character slots, autosaving, and JSON export/import are available. Enemies and bosses respawn when you re-enter an area; world state is not saved.

Core loop: **Explore → Slay and loot → Combine affixes → Prepare in town → Challenge bosses or deeper dungeons**.

### Current interface and exploration

- A title screen offers start/continue, settings and language selection. Load is inside Settings; Save immediately saves the current character. Each act has a distinct sanctuary village; trading and forging are town-only.
- Inventory fills each page with as many complete item rows as fit; equipment uses nine anatomical slots. Settings assigns left/right mouse skills independently, marked LMB/RMB on the bottom skill bar. Actors use articulated SVG movement.
- “Equip best” compares every inventory page against equipped gear using the sum of each affix value divided by its T1 maximum, including both ring slots. Broken candidates are skipped and ties keep current gear; replaced items stay in inventory and changes autosave. This general score does not optimize a specific build.
- Equip best stays at the inventory panel’s lower-right corner. The interface uses a 16px base with larger, bolder item/skill names and health values, plus 15px affix details. A wider inventory and two-line names preserve readability.
- “Sell filter” opens a separate window for rarity, slot and maximum item level. Preview the count/value and sell matching inventory in town. Auto-sell is off by default; when enabled, matching new drops become gold even with a full bag. Existing inventory and equipped items are not auto-sold; filters persist with saves. Sales cannot be undone.
- Open Graph and Twitter cards use fixed English metadata and a 1200×630 PNG, derived from the editable vector source `assets/social/nightreap-social.svg`.
- Continuous wilderness and dungeon maps feature solid obstacles, random monster packs and exploration fog.
- Monster deaths leave species-specific corpses (one each for the 24 species, sheep and the five bosses) drawn at 70% transparency and removed after 30 seconds; corpses remain usable material for the Necromancer's Raise Skeleton and Corpse Explosion.
- The roster has 25 species including sheep. Each act adds a distinct Ashbone Archer, Crypt Scarab, Spore Stalker, Frostwing Bat or Void Colossus, using ranged, explosive, burrowing, flying or tank behavior respectively. All five also join dungeon packs without increasing total spawn counts.
- Screenshot, immediately left of Inventory, downloads the current scene and visible interface as a PNG at the device pixel ratio. Local-time filenames use `Nightreap_YYYYMMDD-HHmmss.png`; images are not uploaded.
- Each notification stays for 5 seconds, then slides right and fades out over 0.5 seconds, including in town or while gameplay is paused.

### Installation and offline play

Open over HTTPS or a local HTTP server, not `file://`. After the first online asset download completes, install from a supported desktop browser's menu and play offline. A ready update offers “Save & reload”; updating never deletes IndexedDB.

SVG source icons cover 16/32/180/192/512 and maskable variants; the root `favicon.ico` contains derived 16/32/48px images. After asset changes, maintainers run `node scripts/version-assets.mjs` and commit the refreshed hashes and offline inventory. This is release maintenance, not a required game build step.

There are 20 compositions: three per act, one for each of its three maps, plus one each for the menu, sanctuary, dungeon, Boss battle, and sheep realm. Special scenes take priority; defeating a Boss restores the map's music. Each track lives in `src/data/music/{scene}.json`, the index lists filenames, and `ACT_MUSIC` in `src/data/audio.js` maps campaign areas to tracks. Update these mappings and content hashes when adding music; all tracks are cached for offline play.

Artwork lives under `assets/`: `characters/` for heroes, `creatures/` for monsters/summons/forms, `corpses/` for monster corpses, `terrain/` for the terrain atlas, `sanctuaries/` for villages, `ui/` for skills/equipment, `icons/` for site icons, `scenes/` for the title scene, and `social/` for share images. Actor paths are centralized in `ART` in `src/data/config.js`; terrain remains one atlas grouped by `data-terrain`, not one file per obstacle.


### Status

The game interface integrates core, combat, equipment, world, persistence, audio, and PWA features, with targeted browser verification. Full Normal playthroughs for all five classes, 300-enemy-plus-12-minion performance, all affix effects, and drop distributions still await complete acceptance. Some original monsters share family artwork; the five additions have distinct SVGs. Implemented features are not equivalent to fully passed criteria; see [ACCEPTANCE.md](ACCEPTANCE.md) for evidence and gaps. The original proposal is read-only; explicitly approved changes recorded in [PLAN.md](PLAN.md) override its corresponding sections.

## 授權 / License

© 2026 YueyuHoshizora。本專案以 [GNU Affero General Public License v3.0（AGPL-3.0-only）](LICENSE) 授權；[原始碼](https://github.com/YuStellarGamesStudio/Nightreap)公開提供。

© 2026 YueyuHoshizora. Licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0-only)](LICENSE). [Source code](https://github.com/YuStellarGamesStudio/Nightreap) is available online.
