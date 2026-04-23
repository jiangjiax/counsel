#!/usr/bin/env python3
"""
参谋AI · 快速声音测试
直接生成音频样本，无需启动服务器

Usage:
    cd "Research & Preparations/voice-testing"
    python quick_test.py

This will generate audio samples for each recommended voice pairing.
"""

import os
import json
import base64
import urllib.request
import time

# ============== Config ==============

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

def get_minimax_api_key():
    """从配置文件读取MiniMax API Key"""
    config_paths = [
        os.path.expanduser("~/.config/minimax-mcp/config.json"),
        os.path.expanduser("~/.minimax-mcp/config.json"),
    ]
    for path in config_paths:
        if os.path.exists(path):
            try:
                with open(path) as f:
                    config = json.load(f)
                    return config.get("apiKey") or config.get("api_key")
            except:
                pass
    return os.environ.get("MINIMAX_API_KEY")

def text_to_speech(text, voice_id, output_path, speed=1.0):
    """调用MiniMax TTS API生成音频"""
    api_key = get_minimax_api_key()
    if not api_key:
        raise Exception("MINIMAX_API_KEY not found")

    url = "https://api.minimax.chat/v1/t2a_v2"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    data = {
        "model": "speech-01-turbo",
        "text": text,
        "stream": False,
        "voice_setting": {
            "voice_id": voice_id,
            "speed": speed,
            "pitch": 0,
            "vol": 1
        },
        "audio_setting": {
            "sample_rate": 32000,
            "bitrate": 128000,
            "format": "mp3"
        }
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8'),
        headers=headers,
        method="POST"
    )

    with urllib.request.urlopen(req, timeout=60) as response:
        result = json.loads(response.read().decode('utf-8'))
        if result.get("base_resp", {}).get("status_code") != 0:
            raise Exception(f"API Error: {result}")

        audio_data = result["data"]["content"]  # base64 encoded

        # Decode and save
        audio_bytes = base64.b64decode(audio_data)
        with open(output_path, 'wb') as f:
            f.write(audio_bytes)

        return output_path

# ============== Test Cases ==============

FACILITATOR_TESTS = [
    {
        "name": "Facilitator-CN-播报男声",
        "voice_id": "Chinese (Mandarin)_Male_Announcer",
        "text": "欢迎来到参谋会议。这里聚集了十二位历史上最聪明的大脑。他们将从各自独特的哲学视角，为你照亮盲区。"
    },
    {
        "name": "Facilitator-CN-沉稳高管",
        "voice_id": "Chinese (Mandarin)_Reliable_Executive",
        "text": "欢迎来到参谋会议。这里聚集了十二位历史上最聪明的大脑。他们将从各自独特的哲学视角，为你照亮盲区。"
    },
    {
        "name": "Facilitator-EN-Trustworthy",
        "voice_id": "English_Trustworthy_Man",
        "text": "Welcome to the Roundtable Council. Twelve of history's greatest minds have gathered here. Each will illuminate your blind spots from their unique perspective."
    },
]

PERSONA_TESTS = [
    {
        "name": "BruceLee-李小龙",
        "voice_id": "male-qn-badao",
        "text": "Don't think. Feel. Be water, my friend. Hack away the unessential."
    },
    {
        "name": "Laozi-老子",
        "voice_id": "Chinese (Mandarin)_Gentleman",
        "text": "上善若水。水善利萬物而不爭，處衆人之所惡，故幾於道。"
    },
    {
        "name": "Huineng-六祖慧能",
        "voice_id": "Chinese (Mandarin)_Gentle_Youth",
        "text": "本来无一物，何处惹尘埃。顿悟成佛，直指人心。"
    },
    {
        "name": "Mao-毛泽东",
        "voice_id": "Chinese (Mandarin)_Male_Announcer",
        "text": "实事求是。矛盾是普遍的。战略上藐视敌人，战术上重视敌人。"
    },
    {
        "name": "Qian-钱学森",
        "voice_id": "Chinese (Mandarin)_Male_Announcer",
        "text": "系统工程是组织管理的技术。我们要发展科学技术，建设现代化国防。"
    },
    {
        "name": "Jobs-SteveJobs",
        "voice_id": "male-qn-badao",
        "text": "Stay hungry. Stay foolish. Design is not just what it looks like. Design is how it works."
    },
    {
        "name": "Graham-PaulGraham",
        "voice_id": "male-qn-jingying",
        "text": "Make something people want. The best way to have good ideas is to have lots of ideas and throw away the bad ones."
    },
    {
        "name": "Bezos-JeffBezos",
        "voice_id": "Chinese (Mandarin)_Reliable_Executive",
        "text": "It's always Day 1. Start with the customer and work backwards. Long-term thinking is the enemy of short-term thinking."
    },
    {
        "name": "Musk-ElonMusk",
        "voice_id": "male-qn-badao",
        "text": "First principles. The physics approach. When something is important enough, you do it even if the odds are against you."
    },
    {
        "name": "KevinKelly",
        "voice_id": "English_Trustworthy_Man",
        "text": "Technology wants what life wants. The next billion-dollar companies will be built by entrepreneurs who see this."
    },
    {
        "name": "Einstein",
        "voice_id": "male-qn-jingying",
        "text": "Imagination is more important than knowledge. The important thing is not to stop questioning."
    },
]

def main():
    print("""
╔════════════════════════════════════════════════════════════╗
║              参谋AI · 声音快速测试                         ║
╚════════════════════════════════════════════════════════════╝
    """)

    api_key = get_minimax_api_key()
    if not api_key:
        print("❌ 错误: 未找到 MINIMAX_API_KEY")
        print("   请设置环境变量: export MINIMAX_API_KEY=your_key")
        return

    print(f"✓ API Key已找到\n")

    # 创建输出目录
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 测试Facilitator
    print("=" * 60)
    print("📢 测试 Facilitator 声音")
    print("=" * 60)

    for test in FACILITATOR_TESTS:
        filename = f"{test['name']}.mp3"
        filepath = os.path.join(OUTPUT_DIR, filename)
        print(f"\n▶ 生成: {test['name']}")
        print(f"   Voice: {test['voice_id']}")
        try:
            text_to_speech(test['text'], test['voice_id'], filepath)
            print(f"   ✓ 已保存: {filename}")
        except Exception as e:
            print(f"   ✗ 失败: {e}")
        time.sleep(0.5)  # 避免API限流

    # 测试幕僚
    print("\n" + "=" * 60)
    print("🥋 测试 幕僚声音")
    print("=" * 60)

    for test in PERSONA_TESTS:
        filename = f"{test['name']}.mp3"
        filepath = os.path.join(OUTPUT_DIR, filename)
        print(f"\n▶ 生成: {test['name']}")
        print(f"   Voice: {test['voice_id']}")
        try:
            text_to_speech(test['text'], test['voice_id'], filepath)
            print(f"   ✓ 已保存: {filename}")
        except Exception as e:
            print(f"   ✗ 失败: {e}")
        time.sleep(0.5)

    print("\n" + "=" * 60)
    print("✅ 测试完成！")
    print(f"   音频文件位置: {OUTPUT_DIR}")
    print("   用浏览器打开 voice-testing-interface.html 选择你的声音")
    print("=" * 60)

if __name__ == '__main__':
    main()
