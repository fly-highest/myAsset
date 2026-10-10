// 숫자·날짜 포맷 (22항)
window.Fmt = (function () {
  const MINUS = '−';
  const nf = (min, max) => new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
  const n0 = nf(0, 0), n2 = nf(2, 2), n4 = nf(0, 4), n8 = nf(8, 8);

  const r0 = v => { const x = Math.round(v); return x === 0 ? 0 : x; };
  const r2 = v => { const x = Math.round(v * 100) / 100; return x === 0 ? 0 : x; };

  function krw(v) { const x = r0(v); return (x < 0 ? MINUS : '') + '₩' + n0.format(Math.abs(x)); }
  function usd(v) { const x = r2(v); return (x < 0 ? MINUS : '') + '$' + n2.format(Math.abs(x)); }
  // 금 환산(XAU): 금 무게 g, 소수 둘째 자리
  function gold(v) { const x = r2(v); return (x < 0 ? MINUS : '') + n2.format(Math.abs(x)) + 'g'; }
  function money(v, cur) { return cur === 'USD' ? usd(v) : cur === 'XAU' ? gold(v) : krw(v); }
  function rounded(v, cur) { return cur === 'USD' || cur === 'XAU' ? r2(v) : r0(v); }
  // 손익: 이익은 + 부호
  function signedMoney(v, cur) { return (rounded(v, cur) > 0 ? '+' : '') + money(v, cur); }
  function pct(v) { const x = r2(v); return (x > 0 ? '+' : x < 0 ? MINUS : '') + n2.format(Math.abs(x)) + '%'; }
  function weight(v) { return n2.format(r2(v)) + '%'; }
  function fx(v) { return '₩' + n2.format(v); }
  function plain(v, digits) { return nf(0, digits ?? 0).format(v); }
  // 수량: 주식 정수(소수점 주식은 최대 4자리), 암호화폐 8자리, 현금은 금액 형식
  function qty(v, inst) {
    if (!inst) return n4.format(v);
    if (inst.asset_type === 'CRYPTO') return n8.format(v);
    if (inst.asset_type === 'CASH') return money(v, inst.currency); // 현금은 금액이므로 ₩ / $ 표시
    return n4.format(v);
  }
  // 단가(원본통화)
  function price(v, cur) { return cur === 'USD' ? usd(v) : krw(v); }
  // 손익 색상 클래스 (한국식: 이익 빨강, 손실 파랑)
  function cls(v, cur) { const x = cur === 'PCT' ? r2(v) : rounded(v, cur); return x > 0 ? 'pos' : x < 0 ? 'neg' : ''; }

  // ---- 날짜 (KST) ----
  const kstParts = d => {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
    return p;
  };
  function todayKST() { const p = kstParts(new Date()); return `${p.year}-${p.month}-${p.day}`; }
  function hourKST() { return +kstParts(new Date()).hour; }
  function mdhm(iso) { if (!iso) return ''; const p = kstParts(new Date(iso)); return `${p.month}/${p.day} ${p.hour}:${p.minute}`; }
  function md(dateStr) { return dateStr ? dateStr.slice(5, 7) + '/' + dateStr.slice(8, 10) : ''; }
  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  return { MINUS, krw, usd, gold, money, signedMoney, pct, weight, fx, plain, qty, price, cls, todayKST, hourKST, mdhm, md, addDays };
})();

window.esc = function (s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
};
