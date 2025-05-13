import requests
import random
import time
import sys
import gc
from urllib.parse import urlparse
import os
from datetime import datetime
import pytz

# 设置北京时区
beijing_timezone = pytz.timezone('Asia/Shanghai')

# 设置请求超时和会话管理
REQUEST_TIMEOUT = 30
MAX_RETRIES = 2

def read_url_yaml(file_path):
    """更高效地读取 YAML 文件中的 URL"""
    urls = []
    try:
        with open(file_path, 'r') as stream:
            # 逐行处理，只读取有效的非注释行
            for line in stream:
                line = line.strip()
                if line and not line.startswith('#'):
                    urls.append(line.split('#')[0].strip())
    except Exception as e:
        print(f"读取文件 {file_path} 时出错: {str(e)}")
    return urls

def is_valid_url(url):
    """检查 URL 是否有效"""
    try:
        result = urlparse(url)
        return all([result.scheme, result.netloc])
    except ValueError:
        return False

def is_in_time_period(current_hour, time_range):
    """检查当前时间是否在指定时间段内"""
    start_hour, end_hour = time_range
    return start_hour <= current_hour < end_hour

def visit_url(session, url, wait_time=1):
    """访问指定 URL 并等待指定时间"""
    try:
        print(f"访问 {url}")
        sys.stdout.flush()
        
        # 添加随机User-Agent
        random_ua = random.choice(USER_AGENTS)
        headers = {'User-Agent': random_ua}
        
        # 发送GET请求
        response = session.get(
            url, 
            headers=headers, 
            timeout=REQUEST_TIMEOUT,
            allow_redirects=True,
            verify=False  # 忽略SSL证书验证以提高性能
        )
        
        # 打印状态码
        print(f"状态码: {response.status_code}")
        sys.stdout.flush()
        
        # 等待指定时间
        time.sleep(wait_time)
        
        # 显式地释放response内容
        response.close()
        
    except requests.RequestException as e:
        print(f"访问 {url} 时出错: {str(e)}")
        sys.stdout.flush()
    except Exception as e:
        print(f"未知错误: {str(e)}")
        sys.stdout.flush()

# 常用User-Agent列表，用于随机化请求
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    "Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36 Edg/92.0.902.55"
]

def main():
    # 获取北京时间的小时数
    current_hour = datetime.now(beijing_timezone).hour
    
    # 设置时间段
    time_periods = {
        'TIME1': list(map(int, os.environ.get("TIME1", "2,5").split(","))),
        'TIME2': list(map(int, os.environ.get("TIME2", "0,6").split(","))),
        'TIME3': list(map(int, os.environ.get("TIME3", "1,6").split(",")))
    }
    
    # YAML 文件路径
    yaml_files = {
        'url': '/tmp/sub/url.yaml',
        'url1': '/tmp/sub/url1.yaml',
        'url2': '/tmp/sub/url2.yaml',
        'url3': '/tmp/sub/url3.yaml'
    }
    
    # 读取 YAML 文件内容 - 直接读取为列表
    url_lists = {key: read_url_yaml(path) for key, path in yaml_files.items()}
    
    # 根据环境变量添加额外的 URL
    platform_urls = []
    if 'SPACE_HOST' in os.environ:
        platform_urls.append(f"https://{os.environ['SPACE_HOST']}")

    if 'RENDER_EXTERNAL_URL' in os.environ:
        platform_urls.append(os.environ['RENDER_EXTERNAL_URL'])

    if 'KOYEB_PUBLIC_DOMAIN' in os.environ:
        platform_urls.append(f"https://{os.environ['KOYEB_PUBLIC_DOMAIN']}")

    if 'WORKSPACE_DEV_DOMAIN' in os.environ:
        platform_urls.append(f"https://{os.environ['WORKSPACE_DEV_DOMAIN']}")

    if 'CSB_BASE_PREVIEW_HOST' in os.environ:
        platform_urls.append(f"https://{os.environ['CSB_SANDBOX_ID']}-{os.environ['PORT']}.{os.environ['CSB_BASE_PREVIEW_HOST']}")
    
    # 将平台URL添加到主URL列表前面
    if platform_urls:
        url_lists['url'] = platform_urls + url_lists['url']

    # 创建一个会话，以重用连接
    with requests.Session() as session:
        # 配置会话
        session.trust_env = False  # 不使用环境变量代理
        adapter = requests.adapters.HTTPAdapter(max_retries=MAX_RETRIES)
        session.mount('http://', adapter)
        session.mount('https://', adapter)
        
        # 关闭不必要的功能以减少内存使用
        session.hooks = {'response': None}
        
        # 定义处理函数
        def process_url_set(urls, time_key=None, wait_range=None):
            # 如果指定了时间段，检查是否在时间段内
            if time_key and is_in_time_period(current_hour, time_periods[time_key]):
                return
            
            count = 0
            for url in urls:
                if not url or not is_valid_url(url):
                    if url:  # 只打印非空无效URL
                        print(f"无效 URL: {url}")
                        sys.stdout.flush()
                    continue
                    
                # 确定等待时间
                wait_time = random.randint(*wait_range) if wait_range else 1
                
                # 访问URL
                visit_url(session, url, wait_time)
                
                # 每处理5个URL触发一次垃圾回收
                count += 1
                if count % 5 == 0:
                    gc.collect()
        
        try:
            # 按顺序处理不同的URL列表
            # 首先处理 url3 (条件: 不在 TIME3 时间段内)
            process_url_set(url_lists['url3'], 'TIME3', (2, 5))
            
            # 处理主 URL 列表
            process_url_set(url_lists['url'], None, None)
            
            # 处理 url1 (条件: 不在 TIME1 时间段内)
            process_url_set(url_lists['url1'], 'TIME1', (2, 5))
            
            # 处理 url2 (条件: 不在 TIME2 时间段内)
            process_url_set(url_lists['url2'], 'TIME2', (2, 5))
            
        except Exception as e:
            print(f"运行时出错: {str(e)}")
            sys.stdout.flush()
        finally:
            # 强制垃圾回收
            gc.collect()

if __name__ == "__main__":
    # 禁用警告以减少输出和内存使用
    import warnings
    warnings.filterwarnings("ignore")
    
    # 禁用SSL警告
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    main()
