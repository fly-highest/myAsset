// 로그인 (Supabase Auth)
// - 비밀번호는 Supabase 서버에만 암호화되어 저장되고, 이 코드·GitHub 에는 없습니다.
// - 화면에서는 아이디(예: flygogo)만 입력하고, 내부에서 이메일(flygogo@myasset.app)로 바꿔 로그인합니다.
// - 로그인 상태(토큰)는 이 브라우저에 저장되고 자동으로 연장됩니다. 로그아웃하면 지워집니다.
// - 새 회원가입은 DB 에서 막혀 있습니다.
window.Auth = (function () {
  const SB = APP_CONFIG.SUPABASE;
  const DOMAIN = 'myasset.app';
  const client = window.supabase && SB && SB.url
    ? window.supabase.createClient(SB.url, SB.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'myAsset.auth' } })
    : null;

  const toEmail = id => {
    const s = String(id || '').trim().toLowerCase();
    return s.includes('@') ? s : `${s}@${DOMAIN}`;
  };
  const toId = email => String(email || '').replace('@' + DOMAIN, '');

  async function session() {
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session;
  }
  // 로그인하지 않았으면 로그인 화면으로 보냄 (돌아올 화면 주소를 함께 전달)
  async function require() {
    const s = await session();
    if (s) return s;
    const here = (location.pathname.split('/').pop() || 'index.html') + location.search + location.hash;
    location.replace('login.html?next=' + encodeURIComponent(here));
    return new Promise(() => {}); // 이동하는 동안 화면을 그리지 않음
  }
  async function signIn(id, password) {
    if (!client) throw new Error('로그인 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
    const { data, error } = await client.auth.signInWithPassword({ email: toEmail(id), password });
    if (error) {
      if (/invalid/i.test(error.message)) throw new Error('아이디 또는 비밀번호가 맞지 않습니다.');
      if (/rate|too many/i.test(error.message)) throw new Error('로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.');
      throw new Error('로그인하지 못했습니다: ' + error.message);
    }
    return data.session;
  }
  async function signOut() {
    if (client) await client.auth.signOut();
    location.replace('login.html');
  }
  // 로그인 후 돌아갈 주소: 이 사이트의 화면 파일만 허용 (다른 사이트로 보내는 주소는 무시)
  function safeNext(next) {
    return /^[a-z]+\.html([?#].*)?$/i.test(next || '') ? next : 'index.html';
  }
  return { client, session, require, signIn, signOut, toId, safeNext };
})();
