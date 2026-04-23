# 参谋AI · 声音匹配方案

## ⚠️ 当前状态

MiniMax TTS API余额不足/Plan不支持：
- `speech-02-hd` ❌ 不支持
- `speech-01-turbo` ❌ 不支持
- `speech-01-hd` ❌ 不支持
- `speech-02-turbo` ❌ 不支持

**解决方案：**
1. 充值MiniMax账户（语音合成按字符计费）
2. 或使用其他TTS服务（Azure, ElevenLabs等）

---

## 声音推荐（基于MiniMax现有声音库）

### Facilitator 主持人

| 用途 | 声音ID | 名称 | 特性 |
|------|--------|------|------|
| **中文首选** | `Chinese (Mandarin)_Male_Announcer` | 播报男声 | 权威、有气场、清晰有力、不和气 |
| **中文备选** | `Chinese (Mandarin)_Reliable_Executive` | 沉稳高管 | 高管气质、冷静、决断力 |
| **英文版** | `English_Trustworthy_Man` | Trustworthy Man | 沉稳可靠 |

**测试文本（中文）：**
```
欢迎来到参谋会议。这里聚集了十二位历史上最聪明的大脑。
他们将从各自独特的哲学视角，为你照亮盲区。
请说出你目前最困惑的问题。
```

**测试文本（英文）：**
```
Welcome to the Roundtable Council. Twelve of history's greatest minds have gathered here.
Each will illuminate your blind spots from their unique perspective.
```

---

## 12位幕僚声音匹配

### 东方大师（中文为主）

| 幕僚 | 推荐声音 | 声音ID | 调性 |
|------|----------|--------|------|
| **李小龙** | 霸道青年 | `male-qn-badao` | 直接、激情、有冲击力 |
| **老子** | 温润男声 | `Chinese (Mandarin)_Gentleman` | 古典温和、慢节奏、智慧感 |
| **六祖慧能** | 温润青年 | `Chinese (Mandarin)_Gentle_Youth` | 年轻觉醒者、直接、当头棒喝 |
| **毛泽东** | 播报男声 | `Chinese (Mandarin)_Male_Announcer` | 战略气势、号召力、权威 |
| **钱学森** | 播报男声 | `Chinese (Mandarin)_Male_Announcer` | 科学系统、播音腔 |

### 西方大师（英文为主）

| 幕僚 | 推荐声音 | 声音ID | 调性 |
|------|----------|--------|------|
| **Steve Jobs** | 霸道青年 | `male-qn-badao` | 强势、激情、极简主义 |
| **Paul Graham** | 精英青年 | `male-qn-jingying` | 思辨、清晰、教授风 |
| **Jeff Bezos** | 沉稳高管 | `Chinese (Mandarin)_Reliable_Executive` | 长期主义、高管气场 |
| **Elon Musk** | 霸道青年 | `male-qn-badao` | 胆大、第一性原理、冲击力 |
| **Kevin Kelly** | Trustworthy | `English_Trustworthy_Man` | 科技预见者、沉稳 |
| **a16z** | 沉稳高管 | `Chinese (Mandarin)_Reliable_Executive` | VC逻辑、资本视角 |
| **Einstein** | 精英青年 | `male-qn-jingying` | 思想实验、教授风度 |

---

## 幕僚代表发言

| 幕僚 | 测试文本 |
|------|----------|
| **Bruce Lee** | Don't think. Feel. Be water, my friend. Hack away the unessential. |
| **Laozi** | 上善若水。水善利萬物而不爭，處衆人之所惡，故幾於道。 |
| **Huineng** | 本来无一物，何处惹尘埃。 |
| **Mao** | 实事求是。矛盾是普遍的。战略上藐视敌人，战术上重视敌人。 |
| **Qian** | 系统工程是组织管理的技术。 |
| **Jobs** | Stay hungry. Stay foolish. Design is how it works. |
| **Graham** | Make something people want. The best way to have good ideas is to have lots of ideas. |
| **Bezos** | It's always Day 1. Start with the customer and work backwards. |
| **Musk** | First principles. The physics approach. |
| **Kevin Kelly** | Technology wants what life wants. |
| **Einstein** | Imagination is more important than knowledge. |

---

## 背景音乐建议

### 虚空静谧氛围（用于进入会议）
- **风格**: 环境音乐、禅意、冥想
- **MiniMax音乐生成提示词**:
  ```
  ambient meditation music, Chinese mountains, mist, slow breathing,
  zen temple atmosphere, minimal piano and guqin, 60 BPM, 3 minutes loop
  ```
- **备选**: 喜多郎《丝绸之路》风格

### 打字机音效（每个字出来的时候）
- 实现方式：CSS animation + Web Audio API
- 或使用短促的keyclick采样

---

## 文件说明

| 文件 | 用途 |
|------|------|
| `voice-testing-interface.html` | 声音测试界面（需API支持） |
| `voice_server.py` | Python服务器（驱动HTML界面） |
| `quick_test.py` | 快速生成测试音频脚本 |
| `voice-match-report.md` | 声音匹配方案 |
| `VOICE-GUIDE.md` | 本文档，综合指南 |

---

## 启用API测试

当MiniMax账户有足够余额后：

```bash
cd "Research & Preparations/voice-testing"
python quick_test.py
```

这会生成所有推荐声音的测试音频到当前目录。
