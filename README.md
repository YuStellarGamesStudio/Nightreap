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

### Status

Core, combat, equipment, world, persistence, and audio modules have milestone checkpoint commits; game integration and acceptance remain pending. The gameplay above describes design goals. See [ACCEPTANCE.md](ACCEPTANCE.md) for observed verification.

## License

[MIT](LICENSE) © 2026 YueyuHoshizora
