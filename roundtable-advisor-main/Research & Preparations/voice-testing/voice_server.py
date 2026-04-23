#!/usr/bin/env python3
"""
参谋AI · 声音测试服务器
驱动 voice-testing-interface.html

Usage:
    cd "Research & Preparations/voice-testing"
    python voice_server.py

Then open: http://localhost:8765
"""

import os
import json
import base64
import subprocess
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading
import time

# ============== MiniMax TTS API ==============
# Note: 需要设置环境变量 MINIMAX_API_KEY
# 或直接从 ~/.config/minimax-mcp/config.json 读取

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

def text_to_speech(text, voice_id, output_path, speed=1.0, pitch=0, vol=1, emotion="neutral"):
    """调用MiniMax TTS API生成音频"""
    api_key = get_minimax_api_key()
    if not api_key:
        raise Exception("MINIMAX_API_KEY not found. Please set it in config or environment.")

    import urllib.request
    import urllib.parse

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
            "pitch": pitch,
            "vol": vol
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
        return result["data"]["extra_info"]["audio_url"] or result["data"]["content"]

def generate_music(prompt, lyrics="", output_path="ambient.mp3"):
    """生成背景音乐（如果API支持）"""
    # MiniMax音乐生成API调用
    # 这个是可选的，如果API不支持可以注释掉
    pass

# ============== HTTP Server ==============

AUDIO_DIR = os.path.dirname(os.path.abspath(__file__))

class VoiceHandler(SimpleHTTPRequestHandler):
    """自定义HTTP处理器，支持TTS API调用"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=AUDIO_DIR, **kwargs)

    def do_POST(self):
        """处理TTS API请求"""
        if self.path == '/api/tts':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length).decode('utf-8')
                params = json.loads(body)

                text = params.get('text', '')
                voice_id = params.get('voiceId', 'male-qn-jingying')
                output_file = params.get('outputFile', 'output.mp3')

                if not text:
                    self.send_error(400, "Text is required")
                    return

                # 生成音频
                audio_data = text_to_speech(
                    text=text,
                    voice_id=voice_id,
                    output_path=output_file,
                    speed=params.get('speed', 1.0),
                    pitch=params.get('pitch', 0),
                    vol=params.get('vol', 1.0),
                    emotion=params.get('emotion', 'neutral')
                )

                # 保存音频文件
                output_path = os.path.join(AUDIO_DIR, output_file)

                # 如果返回的是base64
                if isinstance(audio_data, str) and len(audio_data) > 100:
                    # 可能是base64编码的音频
                    try:
                        audio_bytes = base64.b64decode(audio_data)
                        with open(output_path, 'wb') as f:
                            f.write(audio_bytes)
                    except:
                        # 如果不是base64，可能返回的是URL
                        self.send_json({"audioUrl": audio_data, "status": "remote"})
                        return
                else:
                    # 下载远程音频
                    import urllib.request
                    urllib.request.urlretrieve(audio_data, output_path)

                audio_url = f"http://localhost:{self.server.server_port}/{output_file}"
                self.send_json({"audioUrl": audio_url, "status": "ok", "file": output_file})

            except Exception as e:
                self.send_error(500, str(e))
        else:
            self.send_error(404, "Not Found")

    def do_GET(self):
        """处理GET请求"""
        if self.path == '/api/voices':
            # 返回所有可用声音列表
            voices = [
                # Facilitator用
                {"id": "Chinese (Mandarin)_Male_Announcer", "name": "播报男声", "lang": "CN"},
                {"id": "Chinese (Mandarin)_Reliable_Executive", "name": "沉稳高管", "lang": "CN"},
                {"id": "English_Trustworthy_Man", "name": "Trustworthy Man", "lang": "EN"},
                # 幕僚用
                {"id": "male-qn-badao", "name": "霸道青年", "lang": "CN/EN"},
                {"id": "male-qn-jingying", "name": "精英青年", "lang": "CN/EN"},
                {"id": "Chinese (Mandarin)_Gentleman", "name": "温润男声", "lang": "CN"},
                {"id": "Chinese (Mandarin)_Gentle_Youth", "name": "温润青年", "lang": "CN"},
                {"id": "Chinese (Mandarin)_Southern_Young_Man", "name": "南方小哥", "lang": "CN"},
            ]
            self.send_json(voices)
        else:
            super().do_GET()

    def send_json(self, data):
        """发送JSON响应"""
        response = json.dumps(data).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(response))
        self.end_headers()
        self.wfile.write(response)

    def log_message(self, format, *args):
        """自定义日志格式"""
        print(f"[{time.strftime('%H:%M:%S')}] {args[0]}")

def run_server(port=8765):
    """启动服务器"""
    server = HTTPServer(('localhost', port), VoiceHandler)
    print(f"""
╔════════════════════════════════════════════════════════════╗
║           参谋AI · 声音测试台                              ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║   🌐 打开浏览器访问: http://localhost:{port}                ║
║                                                            ║
║   按 Ctrl+C 停止服务器                                     ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    """)
    server.serve_forever()

if __name__ == '__main__':
    import sys

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765

    # 检查API Key
    api_key = get_minimax_api_key()
    if not api_key:
        print("⚠️  警告: 未找到 MINIMAX_API_KEY")
        print("   请设置环境变量: export MINIMAX_API_KEY=your_key")
        print("   或在 ~/.config/minimax-mcp/config.json 中配置")
        print()

    run_server(port)
