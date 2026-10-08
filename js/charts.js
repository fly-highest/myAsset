// 차트 공통 (Chart.js CDN)
window.Charts = (function () {
  if (window.Chart) {
    Chart.defaults.font.family = '"Pretendard","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif';
    Chart.defaults.color = '#6b7486';
  }

  // 스냅샷 목록 → 통화 모드별 시계열. 과거 USD·혼합 모드는 items 에서 재계산합니다 (16·21항).
  async function snapshotSeries(snaps, mode) {
    const labels = snaps.map(s => s.snapshot_date);
    if (mode === 'KRW') {
      return { labels, series: [
        { label: '평가금액', cur: 'KRW', data: snaps.map(s => s.total_value_krw) },
        { label: '투자금액', cur: 'KRW', data: snaps.map(s => s.total_invested_krw), dashed: true }
      ] };
    }
    const models = await Promise.all(snaps.map(async s => Calc.buildSnapshotModel(await DataService.getSnapshotItems(s.id))));
    if (mode === 'USD') {
      return { labels, series: [
        { label: '평가금액', cur: 'USD', data: models.map(m => (m.fx ? m.total.valK / m.fx : 0)) },
        { label: '투자금액', cur: 'USD', data: models.map(m => (m.fx ? m.total.invK / m.fx : 0)), dashed: true }
      ] };
    }
    return { labels, series: [
      { label: '한국자산 평가 (₩)', cur: 'KRW', data: models.map(m => m.total.kr.val) },
      { label: '한국자산 투자 (₩)', cur: 'KRW', data: models.map(m => m.total.kr.inv), dashed: true },
      { label: '미국자산 평가 ($)', cur: 'USD', data: models.map(m => m.total.us.val), axis: 'y1' },
      { label: '미국자산 투자 ($)', cur: 'USD', data: models.map(m => m.total.us.inv), axis: 'y1', dashed: true }
    ] };
  }

  const tick = cur => v => {
    if (cur === 'USD') return '$' + Fmt.plain(v);
    return Math.abs(v) >= 1e8 ? '₩' + Fmt.plain(v / 1e8, 2) + '억' : Math.abs(v) >= 1e4 ? '₩' + Fmt.plain(v / 1e4) + '만' : '₩' + Fmt.plain(v);
  };
  const palette = ['#2453d6', '#8fa6e8', '#17a589', '#8fd1c4'];

  function trend(canvasId, { labels, series }) {
    const hasY1 = series.some(s => s.axis === 'y1');
    const y0cur = (series.find(s => s.axis !== 'y1') || {}).cur || 'KRW';
    return UI.chart(canvasId, {
      type: 'line',
      data: {
        labels,
        datasets: series.map((s, i) => ({
          label: s.label, data: s.data, yAxisID: s.axis || 'y',
          borderColor: palette[i % palette.length], backgroundColor: palette[i % palette.length],
          borderWidth: s.dashed ? 1.5 : 2, borderDash: s.dashed ? [5, 4] : [], pointRadius: 0, tension: 0.15
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 14, boxHeight: 2 } },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${Fmt.money(c.parsed.y, series[c.datasetIndex].cur)}` } }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 8, callback: function (v) { return Fmt.md(this.getLabelForValue(v)); } }, grid: { display: false } },
          y: { ticks: { callback: tick(y0cur) }, grid: { color: '#eef1f5' } },
          ...(hasY1 ? { y1: { position: 'right', ticks: { callback: tick('USD') }, grid: { display: false } } } : {})
        }
      }
    });
  }

  function doughnut(canvasId, labels, values, colors) {
    const total = values.reduce((a, b) => a + b, 0);
    return UI.chart(canvasId, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 1, borderColor: '#fff' }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, cutout: '58%',
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12 } },
          tooltip: { callbacks: { label: c => `${c.label}: ${Fmt.weight(total ? (c.parsed / total) * 100 : 0)}` } }
        }
      }
    });
  }

  // 자산군 비중 추이 (100% 누적, 원화 환산 기준 — 통화 모드와 무관)
  function groupShare(canvasId, snaps) {
    const labels = snaps.map(s => s.snapshot_date);
    return UI.chart(canvasId, {
      type: 'line',
      data: {
        labels,
        datasets: Groups.list.map(g => ({
          label: g.name, fill: true, pointRadius: 0, borderWidth: 1, tension: 0.1,
          borderColor: g.color, backgroundColor: g.color + 'b3',
          data: snaps.map(s => (s.total_value_krw ? (s.group_values[g.code] / s.total_value_krw) * 100 : 0))
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12 } },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${Fmt.weight(c.parsed.y)}` } }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 8, callback: function (v) { return Fmt.md(this.getLabelForValue(v)); } }, grid: { display: false } },
          y: { stacked: true, min: 0, max: 100, ticks: { callback: v => v + '%' }, grid: { color: '#eef1f5' } }
        }
      }
    });
  }

  return { snapshotSeries, trend, doughnut, groupShare };
})();
