# worker-keep-online

# worker部署保活网页

这是一个基于Cloudflare Workers的URL访问工具，可以定期访问指定的URL列表。该工具从GitHub私有仓库读取URL配置，支持24小时不间断访问和按时间段访问。

修改自老王的https://github.com/eooce/Auto-keep-online.git项目

## 功能特点

- 从GitHub私有仓库读取URL配置
- 支持24小时不间断访问的URL列表
- 支持三个不同时间段的URL访问列表
- 可自定义请求超时时间和User-Agent
- 详细的日志记录

## 使用方法

### 1. 在GitHub创建私有仓库并添加配置文件

在您的GitHub私有仓库中创建以下四个YAML文件：

- `url.yaml`: 包含24小时不间断访问的URL（每行一个）
- `url1.yaml`: 包含时间段1访问的URL（每行一个）
- `url2.yaml`: 包含时间段2访问的URL（每行一个）
- `url3.yaml`: 包含时间段3访问的URL（每行一个）

每个文件的格式示例：

```yaml
# 这是一个注释行，会被忽略
https://example.com/site1
https://example.com/site2
# 另一个注释
https://example.com/site3
```

### 2. 创建GitHub个人访问令牌

1. 访问GitHub的[Personal Access Tokens](https://github.com/settings/tokens)页面
2. 点击"Generate new token"
3. 为令牌添加描述，如"URL访问工具"
4. 选择"repo"权限范围（用于访问私有仓库）
5. 点击"Generate token"并保存生成的令牌

### 3. 部署Cloudflare Worker

1. 登录[Cloudflare Workers](https://workers.cloudflare.com/)
2. 创建新的Worker
3. 复制下方源代码并粘贴到Worker编辑器中
4. 在CONFIG对象中填入您的GitHub令牌和仓库信息，或使用环境变量

### 4. 配置Worker环境变量（可选）

如果不想在代码中硬编码GitHub令牌，可以在Cloudflare Worker的环境变量中设置：

1. 在Worker的设置页面中，找到"环境变量"部分
2. 添加以下变量：
   - `GITHUB_TOKEN`: 您的GitHub个人访问令牌
   - `GITHUB_REPO`: 您的仓库路径，格式为"用户名/仓库名"

### 5. 配置Cron触发器

在Worker的触发器选项卡中，添加Cron触发器，例如：
- `*/5 * * * *`（每5分钟运行一次）
- `*/10 * * * *`（每10分钟运行一次）

