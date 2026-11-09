import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 把站点放在 https://<user>.github.io/<repo>/ 子路径下，
// 必须设置 base，否则 /assets/... 会 404 白屏。
// 仓库名通过环境变量传入：GH_REPO=<repo> npm run build
const repo = process.env.GH_REPO;
const base = process.env.GITHUB_ACTIONS && repo ? `/${repo}/` : '/';

export default defineConfig({
  base,
  plugins: [react()],
  // 监听所有网卡，手机才能通过局域网 IP 访问
  server: { host: '0.0.0.0', port: 5175, strictPort: true },
});
