#!/usr/bin/env bash
# 用法: fetch-doc.sh <url> <outfile>
URL="$1"; OUT="$2"
curl -sL --max-time 25 "$URL" | python3 -c "
import sys,html,re
t=sys.stdin.read()
# 去掉 nav/footer/侧栏（粗剪：只保留 <article> 或正文区域）
m=re.search(r'<article.*?</article>',t,flags=re.S)
if m: t=m.group(0)
t=re.sub(r'<script.*?</script>','',t,flags=re.S)
t=re.sub(r'<style.*?</style>','',t,flags=re.S)
# 代码块转为 fenced
t=re.sub(r'<pre[^>]*>(.*?)</pre>',lambda m:'\n\`\`\`\n'+re.sub(r'<[^>]+>','',m.group(1))+'\n\`\`\`\n',t,flags=re.S)
t=re.sub(r'<h1[^>]*>(.*?)</h1>',lambda m:'\n# '+re.sub(r'<[^>]+>','',m.group(1))+'\n',t,flags=re.S)
t=re.sub(r'<h2[^>]*>(.*?)</h2>',lambda m:'\n## '+re.sub(r'<[^>]+>','',m.group(1))+'\n',t,flags=re.S)
t=re.sub(r'<h3[^>]*>(.*?)</h3>',lambda m:'\n### '+re.sub(r'<[^>]+>','',m.group(1))+'\n',t,flags=re.S)
t=re.sub(r'<li[^>]*>',lambda m:'\n- ',t)
t=re.sub(r'<p[^>]*>',lambda m:'\n',t)
t=re.sub(r'<br[^>]*>','\n',t)
t=re.sub(r'<[^>]+>','',t)
t=html.unescape(t)
t=re.sub(r'[ \t]+',' ',t)
t=re.sub(r'\n\s*\n+','\n\n',t)
print(t.strip())
" > "$OUT"
echo "saved: $OUT ($(wc -c < "$OUT") bytes)"
