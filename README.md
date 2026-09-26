# 永夜收割 · Nightreap

## 中文

暗黑奇幻 ARPG 割草網頁遊戲：五職業、裝備詞綴、五關卡、四難度與無盡地下城。桌機限定，最低 1280×720。

- 技術：原生 HTML/CSS/JavaScript ES modules，Canvas 2D、SVG、Web Audio、IndexedDB；無框架、CDN 或建置步驟。
- 設計依據：[企劃書](永夜收割-Nightreap-企劃書.md)、[實作計畫](PLAN.md)、[數值設計](DESIGN.md)、[驗收](ACCEPTANCE.md)。
- 操作規劃：WASD 移動、滑鼠瞄準與普攻、1–6 主動技能、R 終極、Tab 背包。
- 網址：https://nightreap.yustellar.dev · 倉庫：https://github.com/YueyuHoshizora/Nightreap
- 語言：`?lang=en` 或 `?lang=zh`；無參數或無效參數時固定使用英文，不依瀏覽器語言切換。
- 開發規則：依 M0–M7 分階段提交，不自動推送或部署。

### 遊戲玩法（規劃）

1. **選擇職業**：戰士以怒氣近戰掃蕩；巫師施放元素法術；死靈法師操控屍體與僕從；射手運用箭矢、陷阱與走位；德魯伊在人形、熊形與狼形之間切換。
2. **探索與戰鬥**：使用 WASD 走位、滑鼠瞄準，搭配普攻、六個主動技能與終極技能清除怪群，閃避攻擊並挑戰精英與 Boss。
3. **刷裝與搭配**：拾取白、藍、金、橘四種稀有度的裝備，配置九個裝備槽。利用燃燒、冰凍、中毒等狀態與詞綴形成 build，例如「施加燃燒＋對燃燒敵人增傷」。
4. **回城整備**：出售戰利品、購買消耗品、賭裝與修理裝備；消耗材料重鑄、洗詞綴或升級詞綴。合成可能失敗，但只損失材料，不毀裝備或改動原詞綴。
5. **推進遠征**：探索五關卡、每關三張小地圖，或進入隨機地下城挑戰更深樓層。擊敗第五關最終 Boss「深淵之主」，依序解鎖普通、困難、惡夢、地獄四難度。
6. **尋找隱藏秘境**：在第二關取得綿羊券並找到隱藏傳送門，每次消耗一張券進入綿羊秘境，獲取經驗與裝備，不影響主線進度。
7. **保留成長**：死亡會回城並受到小額懲罰，但不掉裝備。規劃提供五個角色槽、自動存檔及 JSON 匯出／匯入；重新進圖時怪物與 Boss 重生，世界狀態不存檔。

核心循環：**出城探索 → 清怪刷裝 → 搭配詞綴 → 回城整備 → 挑戰 Boss 或更深地下城**。

### 本輪介面與探索

- 開始畫面提供開始／繼續旅程、設定及語言切換；讀檔移入設定，存檔直接保存目前角色。五幕各有獨立村落式庇護所，商人與鍛造僅在城鎮可用。
- 背包按需開啟，每頁依可用高度填滿物品列，裝備以人形九槽呈現；設定可分別指定滑鼠左右鍵技能，下方技能列標示 LMB／RMB。角色與怪物採分件 SVG 步態。
- 背包「一鍵換裝」比較所有頁面的裝備：以各詞綴數值除以該詞綴 T1 上限後加總，換上更高分裝備（含雙戒指）。略過損壞裝備，同分保留原裝；舊裝留在背包並自動存檔。這是通用評分，不替代流派搭配判斷。
- 一鍵換裝固定在背包面板右下角。介面基準字級 16px，裝備／技能名稱與生命數值放大加粗，詞綴詳情 15px；背包加寬、長名稱可顯示兩行，避免靠縮小文字塞版面。
- 背包「出售篩選」另開小視窗，多選稀有度與部位、指定物品等級上限，預覽件數及總價後在庇護所一鍵出售。「自動售出」預設關閉，開啟後新掉落符合條件即換金幣（滿背包也可）；不回頭清空背包、不出售身上裝備，條件隨存檔保存。出售無法復原。
- 網站提供固定英文的 Open Graph／Twitter 分享卡，使用 1200×630 PNG；向量原圖為 `assets/nightreap-social.svg`，分享平台相容圖為同名 `.png`。
- 野外與地下城為連續大地圖，包含實體地形障礙、隨機怪群及探索黑霧。
- 怪物共 25 種（含綿羊）：五幕新增灰骨弓手、墓穴甲蟲、孢霧潛行者、霜翼蝙蝠、虛空巨像，各有獨立造型，分別採遠程、自爆、潛地、飛行、重裝近戰行為，並加入地下城混編；怪物總量不因此增加。
- 上方「截圖」位於背包左側，下載包含當前場景、HUD 與已開背包的 PNG；依本機時間命名 `Nightreap_YYYYMMDD-HHmmss.png`，以裝置像素比例輸出，不上傳圖片。
- 提示各自停留 5 秒，再以 0.5 秒向右滑出並淡出；城鎮或暫停時也會正常消失。

### 安裝與離線

使用 HTTPS 網站或本機 HTTP 伺服器開啟（不可直接開 `file://`）。首次連線等待資產快取完成後，可由支援的桌面瀏覽器選單安裝；之後可離線重新啟動及遊玩。新版本完成快取後顯示「存檔並重新載入」，更新不刪除 IndexedDB。

圖示以 SVG 為來源，提供 16／32／180／192／512 與 maskable 版本；另提供由 SVG 轉製、含 16／32／48px 的根目錄 `favicon.ico`。維護者修改資產後執行 `node scripts/version-assets.mjs`，將內容雜湊與離線清單一起提交；這是發版維護工具，遊戲直接執行已提交檔案，不需建置。

配樂每首獨立存於 `src/data/music/{scene}.json`；`src/data/music/index.json` 只列場景與檔名。新增曲目時建立一份 JSON 並加入索引，不用改 Web Audio 播放引擎；發版前重新產生內容雜湊，所有曲目會各自納入離線快取。


### 開發狀態

目前已有核心、戰鬥、裝備、世界、存檔與音訊模組的階段性提交，尚待遊戲整合與驗收。上述玩法為設計目標；功能是否完成及驗證通過，以 [ACCEPTANCE.md](ACCEPTANCE.md) 紀錄為準。

## English

A desktop dark-fantasy survivor ARPG featuring five classes, affix-driven loot, five acts, four difficulties, and endless dungeons. Minimum viewport: 1280×720.

- Native HTML/CSS/JavaScript ES modules, Canvas 2D, SVG, Web Audio, and IndexedDB. No framework, CDN, or build step.
- Planned controls: WASD to move, mouse to aim/basic attack, 1–6 for skills, R for ultimate, Tab for inventory.
- Languages: `?lang=en` / `?lang=zh`; missing or unsupported parameters default to English, regardless of browser language.
- Project: https://nightreap.yustellar.dev · Repository: https://github.com/YueyuHoshizora/Nightreap
- Development proceeds through M0–M7 with local milestone commits. No automated push or deployment.

### How to play (planned)

1. **Choose a class:** Sweep through enemies with the Warrior's rage-fueled melee attacks, cast elemental spells as the Wizard, command corpses and minions as the Necromancer, combine arrows and traps with evasive movement as the Ranger, or switch between human, bear, and wolf forms as the Druid.
2. **Explore and fight:** Move with WASD and aim with the mouse. Combine basic attacks, six active skills, and an ultimate to clear crowds, dodge attacks, and challenge elites and bosses.
3. **Collect loot and shape your build:** Equip nine slots with common (white), magic (blue), rare (gold), and legendary (orange) gear. Combine affixes with effects such as burning, freezing, and poison—for example, applying burning and dealing extra damage to burning enemies.
4. **Prepare in town:** Sell loot, buy consumables, gamble for gear, and repair equipment. Spend materials to replace an affix, reroll its value, or upgrade its tier. Failed crafting consumes materials but never destroys gear or changes its existing affixes.
5. **Advance your journey:** Explore five acts with three maps each, or descend through increasingly deep procedural dungeons. Defeat the final boss, the Abyss Lord, in Act V to unlock successive difficulties: Normal, Hard, Nightmare, and Hell.
6. **Find the hidden realm:** Obtain a sheep ticket in Act II and locate the hidden portal. Each visit consumes one ticket and offers experience and loot without affecting campaign progression.
7. **Keep your progress:** Death returns you to town with a small penalty, but you keep your equipment. Five character slots, autosaving, and JSON export/import are planned. Enemies and bosses respawn when you re-enter an area; world state is not saved.

Core loop: **Explore → Slay and loot → Combine affixes → Prepare in town → Challenge bosses or deeper dungeons**.

### Current interface and exploration

- A title screen offers start/continue, settings and language selection. Load is inside Settings; Save immediately saves the current character. Each act has a distinct sanctuary village; trading and forging are town-only.
- Inventory fills each page with as many complete item rows as fit; equipment uses nine anatomical slots. Settings assigns left/right mouse skills independently, marked LMB/RMB on the bottom skill bar. Actors use articulated SVG movement.
- “Equip best” compares every inventory page against equipped gear using the sum of each affix value divided by its T1 maximum, including both ring slots. Broken candidates are skipped and ties keep current gear; replaced items stay in inventory and changes autosave. This general score does not optimize a specific build.
- Equip best stays at the inventory panel’s lower-right corner. The interface uses a 16px base with larger, bolder item/skill names and health values, plus 15px affix details. A wider inventory and two-line names preserve readability.
- “Sell filter” opens a separate window for rarity, slot and maximum item level. Preview the count/value and sell matching inventory in town. Auto-sell is off by default; when enabled, matching new drops become gold even with a full bag. Existing inventory and equipped items are not auto-sold; filters persist with saves. Sales cannot be undone.
- Open Graph and Twitter cards use fixed English metadata and a 1200×630 PNG, derived from the editable vector source `assets/nightreap-social.svg`.
- Continuous wilderness and dungeon maps feature solid obstacles, random monster packs and exploration fog.
- The roster has 25 species including sheep. Each act adds a distinct Ashbone Archer, Crypt Scarab, Spore Stalker, Frostwing Bat or Void Colossus, using ranged, explosive, burrowing, flying or tank behavior respectively. All five also join dungeon packs without increasing total spawn counts.
- Screenshot, immediately left of Inventory, downloads the current scene and visible interface as a PNG at the device pixel ratio. Local-time filenames use `Nightreap_YYYYMMDD-HHmmss.png`; images are not uploaded.
- Each notification stays for 5 seconds, then slides right and fades out over 0.5 seconds, including in town or while gameplay is paused.

### Installation and offline play

Open over HTTPS or a local HTTP server, not `file://`. After the first online asset download completes, install from a supported desktop browser's menu and play offline. A ready update offers “Save & reload”; updating never deletes IndexedDB.

SVG source icons cover 16/32/180/192/512 and maskable variants; the root `favicon.ico` contains derived 16/32/48px images. After asset changes, maintainers run `node scripts/version-assets.mjs` and commit the refreshed hashes and offline inventory. This is release maintenance, not a required game build step.

Every composition has its own `src/data/music/{scene}.json`; `src/data/music/index.json` maps scene names to filenames only. Add a track file and index entry without changing the shared Web Audio engine, then refresh content hashes so every track is cached separately for offline play.


### Status

Core, combat, equipment, world, persistence, and audio modules have milestone checkpoint commits; game integration and acceptance remain pending. The gameplay above describes design goals. See [ACCEPTANCE.md](ACCEPTANCE.md) for observed verification.

## 授權 / License

© 2026 YueyuHoshizora。本專案以 [GNU Affero General Public License v3.0（AGPL-3.0-only）](LICENSE) 授權；[原始碼](https://github.com/YueyuHoshizora/Nightreap)公開提供。

© 2026 YueyuHoshizora. Licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0-only)](LICENSE). [Source code](https://github.com/YueyuHoshizora/Nightreap) is available online.
