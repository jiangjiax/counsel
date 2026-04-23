# 参谋AI · 声音设计方案

## 背景

MiniMax TTS API当前Plan不支持所需模型：
- `speech-02-hd` ❌ Plan不支持
- `speech-01-turbo` ❌ Plan不支持
- `speech-01-hd` ❌ Plan不支持
- `speech-02-turbo` ❌ Plan不支持

**需要充值或升级Plan才能使用语音合成功能。**

以下是基于MiniMax现有声音库的分析和推荐。

---

## 声音推荐方案

### Facilitator（主持人）

| 版本 | 声音ID | 名称 | 推荐理由 |
|------|--------|------|----------|
| **中文首选** | `Chinese (Mandarin)_Male_Announcer` | 播报男声 | 权威感、有气场、不和气、清晰有力 |
| **中文备选** | `Chinese (Mandarin)_Reliable_Executive` | 沉稳高管 | 高管气质、冷静、决断力 |
| **英文版** | `English_Trustworthy_Man` | Trustworthy Man | 沉稳可靠、适合国际版 |

### 12位幕僚声音匹配

| 幕僚 | 推荐声音ID | 声音名称 | 匹配理由 |
|------|-----------|----------|----------|
| **Steve Jobs** | `male-qn-badao` | 霸道青年音色 | 强势、激情、极简、直接 |
| **Paul Graham** | `male-qn-jingying` | 精英青年音色 | 思辨、清晰、教授风度 |
| **Jeff Bezos** | `Chinese (Mandarin)_Reliable_Executive` | 沉稳高管 | 长期主义、高管气场、冷静 |
| **Elon Musk** | `male-qn-badao` | 霸道青年音色 | 胆大、第一性原理、冲击力 |
| **Laozi** | `Chinese (Mandarin)_Gentleman` | 温润男声 | 古典、温和、智慧、慢节奏 |
| **Huineng** | `Chinese (Mandarin)_Gentle_Youth` | 温润青年 | 年轻觉醒者、直接、当头棒喝 |
| **Mao Zedong** | `Chinese (Mandarin)_Male_Announcer` | 播报男声 | 战略气势、号召力、权威 |
| **Qian Xuesen** | `Chinese (Mandarin)_Male_Announcer` | 播报男声 | 科学系统、播音腔、系统工程感 |
| **Kevin Kelly** | `English_Trustworthy_Man` | Trustworthy Man | 科技预见者、沉稳、长视角 |
| **a16z** | `Chinese (Mandarin)_Reliable_Executive` | 沉稳高管 | VC逻辑、市场时机、资本视角 |
| **Bruce Lee** | `Chinese (Mandarin)_Southern_Young_Man` | 南方小哥 | 香港背景（李小龙香港成长）、年轻有活力 |
| **Einstein** | `male-qn-jingying` | 精英青年音色 | 思想实验、教授风度、简洁深刻 |

---

## Facilitator声音测试文本

### 中文版
```
欢迎来到参谋会议。
这里聚集了十二位历史上最聪明的大脑。
他们将从各自独特的哲学视角，
为你照亮盲区。
请说出你目前最困惑的问题。
```

### 英文版
```
Welcome to the Roundtable Council.
Twelve of history's greatest minds have gathered here.
Each will illuminate your blind spots from their unique philosophical perspective.
Please share the question that weighs most on your mind.
```

---

## 幕僚代表发言测试

### Bruce Lee (南方小哥)
```
Don't think. Feel.
Be water, my friend.
Hack away the unessential.
```

### Laozi (温润男声)
```
上善若水。
水善利萬物而不爭，
處衆人之所惡，故幾於道。

為學日益，為道日損。
損之又損，以至於無為。
```

### Steve Jobs (霸道青年音色)
```
Stay hungry. Stay foolish.
Design is not just what it looks like.
Design is how it works.
Simple is the ultimate sophistication.
```

### Einstein (精英青年音色)
```
Imagination is more important than knowledge.
The important thing is not to stop questioning.
```

---

## 背景音乐建议

### 虚空静谧氛围
- **风格**: 环境音乐、禅意、冥想
- **推荐**: 喜多郎《丝绸之路》风格、或《道德经》吟诵背景
- **MiniMax音乐生成提示词**:
  - `ambient meditation music, Chinese mountains, mist, slow breathing, zen temple atmosphere, minimal piano and guqin, 60 BPM, 3 minutes loop`

### 打字音效
- 每个字出来：哒哒哒哒的打字机声音
- 可用CSS animation + Web Audio API实现
- 或使用短促的keyclick采样

---

## 下一步

1. 运行 `voice-testing-interface.html` 测试每个声音
2. 用 MiniMax `text_to_audio` 生成样本
3. 根据实际听感微调voice_id选择
4. 选定后更新到 persona 配置中
