使用 Web UI | DeepSeek Harness

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

- 

 跳至内容

 技术预览搜索文档K Main Navigation 入门开发参考
简体中文English
简体中文English
外观菜单返回顶部 Sidebar Navigation 
## 入门

使用 Web UI
配置模型
## SDK

Python
开发
参考本页目录
# 使用 Web UI ​

先按照根 README启动 Web UI；命令会打印其访问地址。本指南从服务器已经运行的状态开始。dsh 进程会把调用目录作为默认文件系统位置，但新的 Web UI 在添加工作区前不会选中任何工作区。
## 配置模型 ​

打开设置 → 模型，输入 DeepSeek API 密钥并保存。模型路由会立即可用，不需要重启服务器。
模型配置指南介绍其他提供方和自定义 OpenAI 兼容端点。
## 选择工作区 ​

点击选择工作区，添加启动 dsh 时所在的项目目录，然后选中它。选中工作区前，会话输入框不可用。
## 运行任务 ​

启动一个会话并发送：
Summarize this repository and identify its main packages.
agent 可以读取和编辑工作区文件、运行命令、委派工作并维护计划。当操作在当前权限策略下需要审批时，Web UI 会先询问你。
## 继续使用 ​

- 配置模型
- 使用 Python SDK
- 使用其他 CLI 模式
- 开发插件 在 GitHub 上编辑此页Pager下一篇配置模型
 window.__VP_HASH_MAP__=JSON.parse("{\"develop_basic_config.md\":\"G9vLTlOQ\",\"develop_basic_index.md\":\"sDLZi3sh\",\"develop_basic_publish.md\":\"Byq2IBdl\",\"develop_basic_tool.md\":\"CtnQ0FQF\",\"develop_cordis-tutorial_01-first-plugin.md\":\"BFbHTzf3\",\"develop_cordis-tutorial_02-lifecycle-and-effects.md\":\"D1D75LAR\",\"develop_cordis-tutorial_03-services.md\":\"Xanftppy\",\"develop_cordis-tutorial_04-events.md\":\"DA3STMqO\",\"develop_cordis-tutorial_05-config.md\":\"C5gs7fyZ\",\"develop_cordis-tutorial_06-composition-and-hmr.md\":\"BjhhrGE9\",\"develop_cordis-tutorial_07-into-the-harness.md\":\"YcWflNqC\",\"develop_cordis-tutorial_index.md\":\"CR2td8ai\",\"develop_framework_events.md\":\"DDGozjqA\",\"develop_framework_index.md\":\"niZNH-3f\",\"develop_framework_service.md\":\"DlxiqRxH\",\"develop_practice_index.md\":\"BGJ9m2m6\",\"develop_practice_llm-adapter.md\":\"Cu5OMf25\",\"en_develop_basic_config.md\":\"mughrxpu\",\"en_develop_basic_index.md\":\"XfYj7iFE\",\"en_develop_basic_publish.md\":\"C8Nq-ect\",\"en_develop_basic_tool.md\":\"HyV0Ro3a\",\"en_develop_cordis-tutorial_01-first-plugin.md\":\"CY1-CtBQ\",\"en_develop_cordis-tutorial_02-lifecycle-and-effects.md\":\"BuFT1ZDq\",\"en_develop_cordis-tutorial_03-services.md\":\"DBHhKjZX\",\"en_develop_cordis-tutorial_04-events.md\":\"C9vGQ7Ex\",\"en_develop_cordis-tutorial_05-config.md\":\"D5zSnjNP\",\"en_develop_cordis-tutorial_06-composition-and-hmr.md\":\"7PbUGZxK\",\"en_develop_cordis-tutorial_07-into-the-harness.md\":\"BycU5OZZ\",\"en_develop_cordis-tutorial_index.md\":\"BNNJ7h5N\",\"en_develop_framework_events.md\":\"CD0w0ZJd\",\"en_develop_framework_index.md\":\"Cxu6zq0j\",\"en_develop_framework_service.md\":\"BJF-d53k\",\"en_develop_practice_index.md\":\"5nZEgbfJ\",\"en_develop_practice_llm-adapter.md\":\"DMUYm8QD\",\"en_guide_providers.md\":\"D0OXXgMX\",\"en_guide_python-sdk.md\":\"Cbp1sdPv\",\"en_guide_quickstart.md\":\"CgjTLdKU\",\"en_index.md\":\"lUI1kfus\",\"en_reference_agent-lifecycle.md\":\"C8UV0oEe\",\"en_reference_capability-seams.md\":\"BSXElgoO\",\"en_reference_config-catalog.md\":\"C1Q9Ftgg\",\"en_reference_cookbook_adding-a-conversation-node.md\":\"Bd4xBA6H\",\"en_reference_cookbook_adding-a-package.md\":\"CFDTt819\",\"en_reference_cookbook_adding-a-tool.md\":\"DKeuDtl6\",\"en_reference_cookbook_adding-an-llm-adapter.md\":\"D_EnrDWo\",\"en_reference_cookbook_extension-cookbook.md\":\"C8kAWmQ-\",\"en_reference_cordis-api_context.md\":\"DzgjEGmh\",\"en_reference_cordis-api_events.md\":\"CaF4UuWq\",\"en_reference_cordis-api_fiber.md\":\"DzbCpXh2\",\"en_reference_cordis-api_inherited.md\":\"B40KXI1y\",\"en_reference_cordis-api_registry.md\":\"CZKOqo7r\",\"en_reference_cordis-api_service.md\":\"DO8LJLKK\",\"en_reference_cordis-primer.md\":\"D9rVdmdi\",\"en_reference_index.md\":\"DZPK0NgJ\",\"en_reference_persistence-catalog.md\":\"C1K6PY94\",\"en_reference_subsystems_approval.md\":\"BPlOQ_No\",\"en_reference_subsystems_client-modules.md\":\"Ye28PSca\",\"en_reference_subsystems_code-runtime.md\":\"BpcfuCgn\",\"en_reference_subsystems_commands.md\":\"CtaCyyTf\",\"en_reference_subsystems_compaction.md\":\"B-y1HBSb\",\"en_reference_subsystems_core.md\":\"LlpKX4j6\",\"en_reference_subsystems_credentials.md\":\"BMQJjU75\",\"en_reference_subsystems_filesystem.md\":\"BLEfaaHS\",\"en_reference_subsystems_goal.md\":\"ypZYp3fr\",\"en_reference_subsystems_index.md\":\"LAT--CLf\",\"en_reference_subsystems_invariants.md\":\"csXUUhJx\",\"en_reference_subsystems_jobs.md\":\"fU-iGjyC\",\"en_reference_subsystems_llm-streaming.md\":\"B4oHtPUJ\",\"en_reference_subsystems_lsp.md\":\"Cx915gVv\",\"en_reference_subsystems_permission-presets.md\":\"B6Ew5jPF\",\"en_reference_subsystems_persistence.md\":\"DbzXYrlE\",\"en_reference_subsystems_plan.md\":\"BMsLflRL\",\"en_reference_subsystems_sandbox.md\":\"BiGtmgJH\",\"en_reference_subsystems_schedule.md\":\"FZfKltq8\",\"en_reference_subsystems_scope.md\":\"CudWQezG\",\"en_reference_subsystems_session-projection.md\":\"Cv5_1zHI\",\"en_reference_subsystems_session-query.md\":\"VMPZc60i\",\"en_reference_subsystems_session-reference.md\":\"CkBaYeXE\",\"en_reference_subsystems_session-telemetry.md\":\"YzrGTS5o\",\"en_reference_subsystems_session-title.md\":\"Ot6_rF_I\",\"en_reference_subsystems_session.md\":\"ZEOSUrwE\",\"en_reference_subsystems_settings.md\":\"B8-dMP_5\",\"en_reference_subsystems_shell.md\":\"DKqw2muj\",\"en_reference_subsystems_skills.md\":\"DoFFfYke\",\"en_reference_subsystems_spill.md\":\"ByFXeY1V\",\"en_reference_subsystems_storage.md\":\"D1nJeUtW\",\"en_reference_subsystems_subagent.md\":\"bG9DnpCC\",\"en_reference_subsystems_subprocess.md\":\"sh5DhjFF\",\"en_reference_subsystems_system-prompt.md\":\"n7HmiCIs\",\"en_reference_subsystems_terminal.md\":\"CeiAfOV2\",\"en_reference_subsystems_token-meter.md\":\"BwCbtaSG\",\"en_reference_subsystems_tools.md\":\"BDybMcCD\",\"en_reference_subsystems_typert.md\":\"Q33IsNek\",\"en_reference_subsystems_user-questions.md\":\"D0kv8tyb\",\"en_reference_subsystems_web-server.md\":\"DD9-BdAj\",\"en_reference_subsystems_web.md\":\"BFlS3HY0\",\"en_reference_subsystems_workflow.md\":\"hnWYbEmM\",\"en_reference_subsystems_workspace.md\":\"oL69zA6s\",\"en_reference_tool-catalog.md\":\"QxbGLdjT\",\"en_reference_tool-execution-pipeline.md\":\"25EPKXtV\",\"guide_providers.md\":\"B3liSxhk\",\"guide_python-sdk.md\":\"DdkCDamZ\",\"guide_quickstart.md\":\"B2fenq5z\",\"index.md\":\"FLMPJQDD\",\"reference_agent-lifecycle.md\":\"CS_LVe2_\",\"reference_capability-seams.md\":\"CSZ8V9pf\",\"reference_config-catalog.md\":\"80-BqMCt\",\"reference_cookbook_adding-a-conversation-node.md\":\"BAcBNsXB\",\"reference_cookbook_adding-a-package.md\":\"-xMF0bmR\",\"reference_cookbook_adding-a-tool.md\":\"vOigUTlA\",\"reference_cookbook_adding-an-llm-adapter.md\":\"D3NS5l9X\",\"reference_cookbook_extension-cookbook.md\":\"Dorua_Xh\",\"reference_cordis-api_context.md\":\"B2vAW2u3\",\"reference_cordis-api_events.md\":\"DqXFiuok\",\"reference_cordis-api_fiber.md\":\"BTJNHaTt\",\"reference_cordis-api_inherited.md\":\"BTKTHvZf\",\"reference_cordis-api_registry.md\":\"B9etKs0Z\",\"reference_cordis-api_service.md\":\"CeZycMMM\",\"reference_cordis-primer.md\":\"CliaP64y\",\"reference_index.md\":\"OB7qdrVE\",\"reference_persistence-catalog.md\":\"C4kc8NtR\",\"reference_subsystems_approval.md\":\"DzjKLLUa\",\"reference_subsystems_client-modules.md\":\"UPBZ-X-5\",\"reference_subsystems_code-runtime.md\":\"B-eCUbED\",\"reference_subsystems_commands.md\":\"sn5rMIg8\",\"reference_subsystems_compaction.md\":\"CQIPQQVC\",\"reference_subsystems_core.md\":\"EzYlFUNf\",\"reference_subsystems_credentials.md\":\"D3tduQji\",\"reference_subsystems_filesystem.md\":\"DW6RRkMi\",\"reference_subsystems_goal.md\":\"DryGv264\",\"reference_subsystems_index.md\":\"Cztv2J55\",\"reference_subsystems_invariants.md\":\"CDz9zaIZ\",\"reference_subsystems_jobs.md\":\"BY5nAE-i\",\"reference_subsystems_llm-streaming.md\":\"BM9ClWLk\",\"reference_subsystems_lsp.md\":\"Bhh-wvHA\",\"reference_subsystems_permission-presets.md\":\"LodB0xoK\",\"reference_subsystems_persistence.md\":\"DQiGr9rF\",\"reference_subsystems_plan.md\":\"DyxlFuPV\",\"reference_subsystems_sandbox.md\":\"CaFVIY0B\",\"reference_subsystems_schedule.md\":\"BDZSo-vE\",\"reference_subsystems_scope.md\":\"DLtiEkwu\",\"reference_subsystems_session-projection.md\":\"ClBF8nvR\",\"reference_subsystems_session-query.md\":\"CdR1Xd91\",\"reference_subsystems_session-reference.md\":\"DWXK989A\",\"reference_subsystems_session-telemetry.md\":\"dUgY66Jn\",\"reference_subsystems_session-title.md\":\"BDyxZG9c\",\"reference_subsystems_session.md\":\"B_ZLC3I_\",\"reference_subsystems_settings.md\":\"BFy1sGNG\",\"reference_subsystems_shell.md\":\"BNGjjYrW\",\"reference_subsystems_skills.md\":\"Bh9LMy8g\",\"reference_subsystems_spill.md\":\"SVUlZfZN\",\"reference_subsystems_storage.md\":\"Cm8VcC2q\",\"reference_subsystems_subagent.md\":\"CrPjIfsB\",\"reference_subsystems_subprocess.md\":\"BiGn4xTn\",\"reference_subsystems_system-prompt.md\":\"D9UnMgl0\",\"reference_subsystems_terminal.md\":\"BFDeM6MO\",\"reference_subsystems_token-meter.md\":\"OZtcT5nC\",\"reference_subsystems_tools.md\":\"1JqfjJMK\",\"reference_subsystems_typert.md\":\"G45A0UR-\",\"reference_subsystems_user-questions.md\":\"CXgI74n2\",\"reference_subsystems_web-server.md\":\"DTVQiuHi\",\"reference_subsystems_web.md\":\"ClGCuDw0\",\"reference_subsystems_workflow.md\":\"D2OLvGZI\",\"reference_subsystems_workspace.md\":\"DR_Q_Y_t\",\"reference_tool-catalog.md\":\"B2W9UMRm\",\"reference_tool-execution-pipeline.md\":\"BVzXhNgn\"}");function deserializeFunctions(r){return Array.isArray(r)?r.map(deserializeFunctions):typeof r=="object"&&r!==null?Object.keys(r).reduce((t,n)=>(t[n]=deserializeFunctions(r[n]),t),{}):typeof r=="string"&&r.startsWith("_vp-fn_")?new Function(`return ${r.slice(7)}`)():r};window.__VP_SITE_DATA__=deserializeFunctions(JSON.parse("{\"lang\":\"en-US\",\"dir\":\"ltr\",\"title\":\"DeepSeek Harness\",\"description\":\"用于构建 Agent Harness 的插件化 SDK\",\"base\":\"/deepseek-harness/\",\"head\":[],\"router\":{\"prefetchLinks\":true},\"appearance\":true,\"themeConfig\":{\"search\":{\"provider\":\"local\",\"options\":{\"locales\":{\"root\":{\"translations\":{\"button\":{\"buttonText\":\"搜索文档\",\"buttonAriaLabel\":\"搜索文档\"},\"modal\":{\"displayDetails\":\"显示详细列表\",\"resetButtonTitle\":\"清除搜索\",\"backButtonTitle\":\"关闭搜索\",\"noResultsText\":\"未找到相关结果\",\"footer\":{\"selectText\":\"选择\",\"selectKeyAriaLabel\":\"回车键\",\"navigateText\":\"切换\",\"navigateUpKeyAriaLabel\":\"上方向键\",\"navigateDownKeyAriaLabel\":\"下方向键\",\"closeText\":\"关闭\",\"closeKeyAriaLabel\":\"Esc 键\"}}}}}}},\"socialLinks\":[{\"icon\":\"github\",\"link\":\"https://github.com/deepseek-ai/deepseek-harness\"}],\"editLink\":{\"pattern\":\"_vp-fn_({ frontmatter }) => {\\n const data = frontmatter;\\n const editSource = typeof data === \\\"object\\\" && data !== null ? Reflect.get(data, \\\"editSource\\\") : void 0;\\n if (typeof editSource !== \\\"string\\\") throw new Error(\\\"Projected documentation page has no editSource frontmatter.\\\");\\n return `https://github.com/deepseek-ai/deepseek-harness/edit/master/${editSource}`;\\n }\",\"text\":\"在 GitHub 上编辑此页\"}},\"locales\":{\"root\":{\"label\":\"简体中文\",\"lang\":\"zh-CN\",\"themeConfig\":{\"siteTitle\":\"\\n
\\n
\\n
\\n
\\n
\\n
\\n
\\n
\\n
\\n\\n 
\\n\\n\\n \\n \\n \\n\\n 技术预览\",\"nav\":[{\"text\":\"入门\",\"link\":\"/guide/quickstart\",\"activeMatch\":\"^/guide/\"},{\"text\":\"开发\",\"link\":\"/develop/basic/\",\"activeMatch\":\"^/develop/\"},{\"text\":\"参考\",\"link\":\"/reference/\",\"activeMatch\":\"^/reference/\"}],\"sidebar\":{\"/guide/\":[{\"text\":\"入门\",\"items\":[{\"text\":\"使用 Web UI\",\"link\":\"/guide/quickstart\"},{\"text\":\"配置模型\",\"link\":\"/guide/providers\"}]},{\"text\":\"SDK\",\"items\":[{\"text\":\"Python\",\"link\":\"/guide/python-sdk\"}]},{\"text\":\"开发\",\"link\":\"/develop/basic/\"},{\"text\":\"参考\",\"link\":\"/reference/\"}],\"/develop/\":[{\"text\":\"基础\",\"items\":[{\"text\":\"第一个 Harness 插件\",\"link\":\"/develop/basic/\"},{\"text\":\"开发一个 Tool\",\"link\":\"/develop/basic/tool\"},{\"text\":\"插件配置\",\"link\":\"/develop/basic/config\"},{\"text\":\"打包与安装插件\",\"link\":\"/develop/basic/publish\"}]},{\"text\":\"框架能力\",\"items\":[{\"text\":\"插件与生命周期\",\"link\":\"/develop/framework/\"},{\"text\":\"服务与依赖\",\"link\":\"/develop/framework/service\"},{\"text\":\"事件系统\",\"link\":\"/develop/framework/events\"}]},{\"text\":\"实战\",\"items\":[{\"text\":\"能力的三层拆分\",\"link\":\"/develop/practice/\"},{\"text\":\"LLM 适配器\",\"link\":\"/develop/practice/llm-adapter\"}]},{\"text\":\"Cordis 框架教程\",\"items\":[{\"text\":\"总览\",\"link\":\"/develop/cordis-tutorial/\"},{\"text\":\"1. 第一个插件\",\"link\":\"/develop/cordis-tutorial/01-first-plugin\"},{\"text\":\"2. 生命周期与副作用\",\"link\":\"/develop/cordis-tutorial/02-lifecycle-and-effects\"},{\"text\":\"3. 服务\",\"link\":\"/develop/cordis-tutorial/03-services\"},{\"text\":\"4. 事件\",\"link\":\"/develop/cordis-tutorial/04-events\"},{\"text\":\"5. 配置\",\"link\":\"/develop/cordis-tutorial/05-config\"},{\"text\":\"6. 组合与热重载\",\"link\":\"/develop/cordis-tutorial/06-composition-and-hmr\"},{\"text\":\"7. 进入 Harness\",\"link\":\"/develop/cordis-tutorial/07-into-the-harness\"}]}],\"/reference/\":[{\"text\":\"概念\",\"items\":[{\"text\":\"架构\",\"link\":\"/reference/\"},{\"text\":\"Cordis 入门\",\"link\":\"/reference/cordis-primer\"},{\"text\":\"能力服务\",\"link\":\"/reference/capability-seams\"},{\"text\":\"Agent 生命周期\",\"link\":\"/reference/agent-lifecycle\"},{\"text\":\"Tool 执行\",\"link\":\"/reference/tool-execution-pipeline\"}]},{\"text\":\"生成参考\",\"items\":[{\"text\":\"插件配置\",\"link\":\"/reference/config-catalog\"},{\"text\":\"Tool Schema\",\"link\":\"/reference/tool-catalog\"},{\"text\":\"持久化事件\",\"link\":\"/reference/persistence-catalog\"}]},{\"text\":\"Cordis API\",\"items\":[{\"text\":\"Context\",\"link\":\"/reference/cordis-api/context\"},{\"text\":\"Events\",\"link\":\"/reference/cordis-api/events\"},{\"text\":\"Fiber\",\"link\":\"/reference/cordis-api/fiber\"},{\"text\":\"Plugin Registry\",\"link\":\"/reference/cordis-api/registry\"},{\"text\":\"Service\",\"link\":\"/reference/cordis-api/service\"},{\"text\":\"继承接口面\",\"link\":\"/reference/cordis-api/inherited\"}]},{\"text\":\"开发手册\",\"items\":[{\"text\":\"新增 Package\",\"link\":\"/reference/cookbook/adding-a-package\"},{\"text\":\"新增 Tool\",\"link\":\"/reference/cookbook/adding-a-tool\"},{\"text\":\"新增 LLM Adapter\",\"link\":\"/reference/cookbook/adding-an-llm-adapter\"},{\"text\":\"扩展模式\",\"link\":\"/reference/cookbook/extension-cookbook\"},{\"text\":\"新增 Conversation Node\",\"link\":\"/reference/cookbook/adding-a-conversation-node\"}]},{\"text\":\"总览\",\"items\":[{\"text\":\"子系统\",\"link\":\"/reference/subsystems/\"}]},{\"text\":\"内核与作用域\",\"collapsed\":true,\"items\":[{\"text\":\"核心\",\"link\":\"/reference/subsystems/core\"},{\"text\":\"作用域\",\"link\":\"/reference/subsystems/scope\"},{\"text\":\"运行时不变式\",\"link\":\"/reference/subsystems/invariants\"}]},{\"text\":\"会话与持久化\",\"collapsed\":true,\"items\":[{\"text\":\"会话\",\"link\":\"/reference/subsystems/session\"},{\"text\":\"会话查询\",\"link\":\"/reference/subsystems/session-query\"},{\"text\":\"会话引用\",\"link\":\"/reference/subsystems/session-reference\"},{\"text\":\"会话标题\",\"link\":\"/reference/subsystems/session-title\"},{\"text\":\"会话投影\",\"link\":\"/reference/subsystems/session-projection\"},{\"text\":\"会话持久化\",\"link\":\"/reference/subsystems/persistence\"},{\"text\":\"Spill 存储\",\"link\":\"/reference/subsystems/spill\"},{\"text\":\"遥测\",\"link\":\"/reference/subsystems/session-telemetry\"}]},{\"text\":\"模型与上下文\",\"collapsed\":true,\"items\":[{\"text\":\"LLM 流式响应\",\"link\":\"/reference/subsystems/llm-streaming\"},{\"text\":\"Token 计量\",\"link\":\"/reference/subsystems/token-meter\"},{\"text\":\"系统提示词\",\"link\":\"/reference/subsystems/system-prompt\"},{\"text\":\"上下文压缩\",\"link\":\"/reference/subsystems/compaction\"}]},{\"text\":\"执行与工具\",\"collapsed\":true,\"items\":[{\"text\":\"工具\",\"link\":\"/reference/subsystems/tools\"},{\"text\":\"Bash 执行\",\"link\":\"/reference/subsystems/shell\"},{\"text\":\"子进程\",\"link\":\"/reference/subsystems/subprocess\"},{\"text\":\"PTY 会话\",\"link\":\"/reference/subsystems/terminal\"},{\"text\":\"后台任务\",\"link\":\"/reference/subsystems/jobs\"},{\"text\":\"文件系统\",\"link\":\"/reference/subsystems/filesystem\"},{\"text\":\"LSP 导航\",\"link\":\"/reference/subsystems/lsp\"},{\"text\":\"代码运行时\",\"link\":\"/reference/subsystems/code-runtime\"},{\"text\":\"Web 访问\",\"link\":\"/reference/subsystems/web\"},{\"text\":\"技能\",\"link\":\"/reference/subsystems/skills\"},{\"text\":\"工作流\",\"link\":\"/reference/subsystems/workflow\"},{\"text\":\"子代理\",\"link\":\"/reference/subsystems/subagent\"}]},{\"text\":\"策略与交互\",\"collapsed\":true,\"items\":[{\"text\":\"审批\",\"link\":\"/reference/subsystems/approval\"},{\"text\":\"权限预设\",\"link\":\"/reference/subsystems/permission-presets\"},{\"text\":\"沙箱\",\"link\":\"/reference/subsystems/sandbox\"},{\"text\":\"计划模式\",\"link\":\"/reference/subsystems/plan\"},{\"text\":\"用户交互\",\"link\":\"/reference/subsystems/user-questions\"},{\"text\":\"命令\",\"link\":\"/reference/subsystems/commands\"},{\"text\":\"目标\",\"link\":\"/reference/subsystems/goal\"},{\"text\":\"定时提醒\",\"link\":\"/reference/subsystems/schedule\"}]},{\"text\":\"平台与接入\",\"collapsed\":true,\"items\":[{\"text\":\"HTTP 服务器\",\"link\":\"/reference/subsystems/web-server\"},{\"text\":\"Typert\",\"link\":\"/reference/subsystems/typert\"},{\"text\":\"客户端模块\",\"link\":\"/reference/subsystems/client-modules\"},{\"text\":\"存储\",\"link\":\"/reference/subsystems/storage\"},{\"text\":\"工作区\",\"link\":\"/reference/subsystems/workspace\"},{\"text\":\"用户设置\",\"link\":\"/reference/subsystems/settings\"},{\"text\":\"用户凭据\",\"link\":\"/reference/subsystems/credentials\"}]}]},\"outline\":{\"label\":\"本页目录\"},\"docFooter\":{\"prev\":\"上一篇\",\"next\":\"下一篇\"},\"darkModeSwitchLabel\":\"外观\",\"lightModeSwitchTitle\":\"切换到浅色主题\",\"darkModeSwitchTitle\":\"切换到深色主题\",\"sidebarMenuLabel\":\"菜单\",\"returnToTopLabel\":\"返回顶部\",\"langMenuLabel\":\"切换语言\",\"skipToContentLabel\":\"跳至内容\"}},\"en\":{\"label\":\"English\",\"lang\":\"en-US\",\"link\":\"/en/\",\"themeConfig\":{\"siteTitle\":\"\\n
\\n
\\n
\\n
\\n<path d=\\\"M92.2781 19.1146C93.9589 19.1146 95.657 18.8721 96.7589 18.1804C97.8607 17.4886 98.2653 16.437 98.2653 15.3949C98.2653 14.3528 97.8697 13.2922 96.7589 12.6094C95.657 11.9266 93.9583 11.6746 92.2781 11.6746C91.5612 11.6746 90.9002 11.5757 90.4319 11.3153C89.9637 11.0454 89.7893 10.6414 89.7893 10.2369C89.7893 9.83234 89.9547 9.41941 90.4319 9.15846C90.9002 8.88858 91.626 8.79917 92.3418 8.79917C93.0576 8.79917 93.7834 8.89808 94.2528 9.15846C94.721 9.42835 94.8954 9.83234 94.8954 10.2369H97.6959C97.6959 9.19422 97.3383 8.13424 96.3375 7.45142C95.3368 6.76861 93.803 6.5166 92.2786
