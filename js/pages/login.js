// 로그인 화면 (login.html)
(function () {
  const SAVE_KEY = 'myAsset.savedId'; // '아이디 저장'을 체크하면 아이디만 저장 (비밀번호는 저장하지 않음)
  const next = Auth.safeNext(new URLSearchParams(location.search).get('next'));
  const $ = id => document.getElementById(id);
  const idEl = $('login-id'), pwEl = $('login-pw'), saveEl = $('save-id'), errEl = $('login-err'), btn = $('login-btn');

  // 이미 로그인되어 있으면 바로 이동
  Auth.session().then(s => { if (s) location.replace(next); });

  let saved = null;
  try { saved = localStorage.getItem(SAVE_KEY); } catch (e) { /* 저장소 사용 불가 */ }
  if (saved) { idEl.value = saved; saveEl.checked = true; pwEl.focus(); } else idEl.focus();

  $('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    errEl.hidden = true;
    const id = idEl.value.trim(), pw = pwEl.value;
    if (!id || !pw) { errEl.textContent = '아이디와 비밀번호를 입력해 주세요.'; errEl.hidden = false; return; }
    btn.disabled = true; btn.textContent = '로그인 중…';
    try {
      await Auth.signIn(id, pw);
      try { saveEl.checked ? localStorage.setItem(SAVE_KEY, id) : localStorage.removeItem(SAVE_KEY); } catch (e2) { /* 무시 */ }
      location.replace(next);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
      pwEl.value = '';
      pwEl.focus();
      btn.disabled = false; btn.textContent = '로그인';
    }
  });
})();
