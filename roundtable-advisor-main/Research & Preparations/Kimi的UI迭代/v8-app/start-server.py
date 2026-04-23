#!/usr/bin/env python3
"""
参谋v8 智能启动脚本
自动尝试多个端口，直到找到一个可用的
"""

import http.server
import socket
import sys
import os

# 要尝试的端口列表（按优先级）
PORTS = [5500, 8080, 3000, 8000, 9000, 5501, 5502, 5503]

def is_port_available(port):
    """检查端口是否可用"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind(('127.0.0.1', port))
        sock.close()
        return True
    except OSError:
        return False

def find_available_port():
    """找到第一个可用端口"""
    for port in PORTS:
        if is_port_available(port):
            return port
    return None

def start_server(port):
    """启动HTTP服务器"""
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    handler = http.server.SimpleHTTPRequestHandler
    
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(('', port))
        sock.listen(5)
        
        print(f"\n{'='*50}")
        print(f"🎯 参谋v8 启动成功！")
        print(f"{'='*50}")
        print(f"\n📍 本地地址: http://localhost:{port}")
        print(f"📍 网络地址: http://127.0.0.1:{port}")
        print(f"\n👉 请在浏览器中打开上述地址")
        print(f"\n{'='*50}")
        print(f"按 Ctrl+C 停止服务器\n")
        
        httpd = http.server.HTTPServer(('0.0.0.0', port), handler)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print(f"\n\n👋 服务器已停止")
            sys.exit(0)

def main():
    print("🔍 正在检查可用端口...")
    
    available_port = find_available_port()
    
    if available_port:
        print(f"✅ 找到可用端口: {available_port}")
        start_server(available_port)
    else:
        print(f"\n❌ 错误: 所有端口都被占用了！")
        print(f"\n尝试的端口: {', '.join(map(str, PORTS))}")
        print(f"\n请手动关闭占用端口的程序，或指定其他端口:")
        print(f"   python3 -m http.server <你的端口>")
        sys.exit(1)

if __name__ == '__main__':
    main()
