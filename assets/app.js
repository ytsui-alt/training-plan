(function () {
  'use strict';

  var KEY = 'tp_state_v1';
  var SRC = {
    bilibili: { name: 'B站', url: function (q) { return 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(q); } },
    xhs: { name: '小红书', url: function (q) { return 'https://www.xiaohongshu.com/search_result?keyword=' + encodeURIComponent(q); } },
    yt: { name: 'YouTube', url: function (q) { return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q); } }
  };

  function today() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function fmtDate(s) {
    if (!s) return '—';
    var p = s.split('-');
    return p[1] + '.' + p[2];
  }

  var DEFAULT = {
    cycle: 1,
    startedAt: today(),
    checks: {},
    variant: {},
    history: [],
    totals: { cycles: 0, actions: 0, days: 0 },
    settings: { source: 'bilibili', expandAll: false }
  };

  var state = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT));
      var s = JSON.parse(raw);
      s.checks = s.checks || {};
      s.variant = s.variant || {};
      s.history = s.history || [];
      s.totals = s.totals || { cycles: 0, actions: 0, days: 0 };
      s.settings = s.settings || { source: 'bilibili', expandAll: false };
      if (!s.cycle) s.cycle = 1;
      if (!s.startedAt) s.startedAt = today();
      return s;
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULT));
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* ---------- 进度计算 ---------- */
  function itemsOf(block) {
    if (block.variants) {
      var key = state.variant[block.id] || block.variants[0].key;
      var v = block.variants.filter(function (x) { return x.key === key; })[0] || block.variants[0];
      return v.items;
    }
    return block.items;
  }

  function countingItems(block) {
    if (block.optional) return [];
    return itemsOf(block).filter(function (i) { return !i.optional; });
  }

  function blockNeed(block) {
    var items = countingItems(block);
    if (block.require != null) return Math.min(block.require, items.length);
    return items.length;
  }

  function blockDone(block) {
    var items = countingItems(block);
    var c = items.filter(function (i) { return !!state.checks[i.id]; }).length;
    return Math.min(c, blockNeed(block));
  }

  function dayStats(day) {
    var done = 0, total = 0;
    day.blocks.forEach(function (b) {
      done += blockDone(b);
      total += blockNeed(b);
    });
    return { done: done, total: total };
  }

  function cycleStats() {
    var done = 0, total = 0, daysTrained = 0, daysDone = 0;
    window.PLAN.days.forEach(function (d) {
      var s = dayStats(d);
      done += s.done; total += s.total;
      if (s.done > 0) daysTrained++;
      if (s.total > 0 && s.done === s.total) daysDone++;
    });
    return { done: done, total: total, daysTrained: daysTrained, daysDone: daysDone };
  }

  function warmupStats() {
    var items = window.PLAN.warmup.blocks[0].items;
    return {
      done: items.filter(function (i) { return !!state.checks[i.id]; }).length,
      total: items.length
    };
  }

  /* ---------- 渲染 ---------- */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function rowHTML(item, idx) {
    var checked = !!state.checks[item.id] ? ' checked' : '';
    var q = item.q || item.name;
    var href = SRC[state.settings.source].url(q);
    var longNote = item.note && item.note.length > 20;
    var tag = item.optional ? '<span class="tag">可选</span>' : '';
    var noteHTML = item.note
      ? '<div class="note-wrap"><span class="note">' + esc(item.note) + '</span>' +
        (longNote ? '<button class="note-toggle" type="button">展开</button>' : '') + '</div>'
      : '';
    return '' +
      '<div class="row' + (checked ? ' is-done' : '') + '" data-id="' + item.id + '">' +
        '<label class="cb-wrap">' +
          '<input type="checkbox" class="cb" data-id="' + item.id + '"' + checked + '>' +
          '<span class="cb-box" aria-hidden="true"></span>' +
        '</label>' +
        '<span class="idx">' + idx + '</span>' +
        '<div class="rb" data-id="' + item.id + '">' +
          '<div class="rl"><span class="nm">' + esc(item.name) + '</span>' + tag + '</div>' +
          noteHTML +
        '</div>' +
        '<div class="rr">' +
          '<div class="spec">' + esc(item.spec) + '</div>' +
          '<a class="demo" href="' + href + '" data-q="' + esc(q) + '" target="_blank" rel="noopener" title="搜索：' + esc(q) + '">看示范</a>' +
        '</div>' +
      '</div>';
  }

  function blockHTML(block) {
    var head = '<div class="block-head">' +
      '<span class="bl-label">' + esc(block.label) + '</span>' +
      (block.sub ? '<span class="bl-sub">' + esc(block.sub) + '</span>' : '') +
      (block.optional ? '<span class="bl-opt">不计入进度</span>' : '') +
      '</div>';

    var variantBar = '';
    if (block.variants) {
      var activeKey = state.variant[block.id] || block.variants[0].key;
      variantBar = '<div class="seg" data-block="' + block.id + '">' +
        block.variants.map(function (v) {
          return '<button type="button" class="seg-btn' + (v.key === activeKey ? ' on' : '') + '" data-key="' + v.key + '">' + esc(v.label) + '</button>';
        }).join('') + '</div>';
    }

    var rows = itemsOf(block).map(function (it, i) {
      return rowHTML(it, String(i + 1).padStart(2, '0'));
    }).join('');

    return '<div class="block" data-block="' + block.id + '">' + head + variantBar + '<div class="rows">' + rows + '</div></div>';
  }

  function renderDays() {
    window.PLAN.days.forEach(function (day) {
      var host = document.getElementById('body-' + day.id);
      if (!host) return;
      host.innerHTML = day.blocks.map(blockHTML).join('') +
        (day.footnotes ? '<div class="footnotes">' + day.footnotes.map(function (f) {
          return '<div class="fn"><span class="fn-t">' + esc(f.title) + '</span><span class="fn-b">' + f.body + '</span></div>';
        }).join('') + '</div>' : '');
    });

    var wHost = document.getElementById('body-warmup');
    if (wHost) {
      wHost.innerHTML = window.PLAN.warmup.blocks.map(blockHTML).join('');
    }
  }

  function renderProgress() {
    // 每日
    window.PLAN.days.forEach(function (day) {
      var s = dayStats(day);
      var pct = s.total ? Math.round(s.done / s.total * 100) : 0;
      var n = document.querySelector('[data-day-stat="' + day.id + '"] .ds-num');
      var bar = document.querySelector('[data-day-stat="' + day.id + '"] .ds-bar i');
      var badge = document.querySelector('[data-day-badge="' + day.id + '"]');
      if (n) n.textContent = s.done + '/' + s.total;
      if (bar) bar.style.width = pct + '%';
      if (badge) badge.classList.toggle('on', s.total > 0 && s.done === s.total);
      var chip = document.querySelector('[data-chip="' + day.id + '"]');
      if (chip) {
        var chipN = chip.querySelector('.chip-n');
        var chipBar = chip.querySelector('.chip-bar i');
        if (chipN) chipN.textContent = s.done + '/' + s.total;
        if (chipBar) chipBar.style.width = pct + '%';
        chip.classList.toggle('full', s.total > 0 && s.done === s.total);
      }
    });

    // 热身
    var w = warmupStats();
    var wb = document.querySelector('[data-day-stat="warmup"] .ds-num');
    var wbar = document.querySelector('[data-day-stat="warmup"] .ds-bar i');
    if (wb) wb.textContent = w.done + '/' + w.total;
    if (wbar) wbar.style.width = (w.total ? Math.round(w.done / w.total * 100) : 0) + '%';

    // 总览
    var c = cycleStats();
    var pctAll = c.total ? Math.round(c.done / c.total * 100) : 0;
    setText('#ov-cycle', '第 ' + String(state.cycle).padStart(2, '0') + ' 轮');
    setText('#ov-pct', pctAll + '%');
    setText('#ov-count', c.done + ' / ' + c.total + ' 个动作');
    var ob = document.querySelector('#ov-bar i');
    if (ob) ob.style.width = pctAll + '%';
    setText('#ov-days', c.daysDone + '/3 天完成');
    setAll('[data-stat="cycles"]', state.totals.cycles);
    setAll('[data-stat="actions"]', state.totals.actions);
    setAll('[data-stat="days"]', state.totals.days);

    // 完成横幅
    var banner = document.getElementById('done-banner');
    if (banner) banner.classList.toggle('show', c.total > 0 && c.done === c.total);

    // 结束本轮按钮
    var endBtn = document.getElementById('end-cycle');
    if (endBtn) {
      endBtn.dataset.rate = pctAll;
      endBtn.querySelector('.ec-main').textContent = (c.done === c.total && c.total > 0) ? '完成本轮 · 开始下一轮' : '提前结束本轮';
      endBtn.querySelector('.ec-sub').textContent = (c.done === c.total && c.total > 0)
        ? '本轮 ' + c.done + ' 个动作全部完成'
        : '当前完成率 ' + pctAll + '% · ' + c.done + '/' + c.total + ' 个动作';
    }

    var inprog = document.getElementById('cycle-inline');
    if (inprog) inprog.textContent = '第 ' + String(state.cycle).padStart(2, '0') + ' 轮进行中 · 自 ' + fmtDate(state.startedAt) + ' 起';
  }

  function renderHistory() {
    var host = document.getElementById('history-list');
    if (!host) return;
    if (!state.history.length) {
      host.innerHTML = '<div class="empty">还没有完成的循环。把三天都勾满，然后点「完成本轮」，这里就会记下一条。</div>';
      return;
    }
    host.innerHTML = state.history.map(function (h) {
      var rate = h.total ? Math.round(h.done / h.total * 100) : 0;
      var full = rate >= 100;
      return '<div class="hrow">' +
        '<span class="hno">' + String(h.cycle).padStart(2, '0') + '</span>' +
        '<span class="hdate">' + fmtDate(h.start) + ' – ' + fmtDate(h.end) + '</span>' +
        '<span class="hmeta">' + h.done + '/' + h.total + ' 动作 · ' + h.days + ' 训练日</span>' +
        '<span class="hrate' + (full ? ' full' : '') + '">' + rate + '%</span>' +
        '</div>';
    }).join('');
  }

  function setText(sel, v) {
    var el = document.querySelector(sel);
    if (el) el.textContent = v;
  }

  function setAll(sel, v) {
    document.querySelectorAll(sel).forEach(function (el) { el.textContent = v; });
  }

  function ioStatus(msg) {
    var el = document.getElementById('io-status');
    if (!el) return;
    el.textContent = msg;
    clearTimeout(ioStatus._t);
    ioStatus._t = setTimeout(function () { el.textContent = ''; }, 5000);
  }

  /* ---------- 静态内容 ---------- */
  function renderStatic() {
    var tg = document.getElementById('time-grid');
    if (tg) {
      tg.innerHTML = window.TIME_BUDGET.map(function (t) {
        return '<div class="tcard">' +
          '<div class="tcard-d">' + esc(t.day) + '</div>' +
          '<div class="tcard-big">' + esc(t.total) + '<span>分钟 / 含氧</span></div>' +
          '<div class="tcard-main">主训 ' + esc(t.main) + ' 分钟</div>' +
          '<div class="tcard-note">' + esc(t.note) + '</div>' +
          '</div>';
      }).join('');
    }

    var wt = document.getElementById('week-total');
    if (wt) {
      wt.innerHTML = window.WEEK_TOTAL.map(function (w) {
        return '<div class="wt-row"><span>' + esc(w.label) + '</span><span>' + esc(w.value) + '</span></div>';
      }).join('');
    }

    var rb = document.getElementById('rules-box');
    if (rb) {
      rb.innerHTML = window.RULES.map(function (r) {
        return '<div class="rule" data-lv="' + r.level + '">' +
          '<div class="rule-t">' + esc(r.title) + '</div>' +
          '<div class="rule-b">' + r.body + '</div>' +
          '</div>';
      }).join('');
    }

    var wb = document.getElementById('week-body');
    if (wb) {
      wb.innerHTML = window.WEEK_PLAN.map(function (w) {
        return '<tr><td>' + esc(w.k) + '</td><td>' + esc(w.v) + '</td></tr>';
      }).join('');
    }
  }

  function renderSourceUI() {
    document.querySelectorAll('.src-btn').forEach(function (b) {
      b.classList.toggle('on', b.dataset.src === state.settings.source);
    });
    document.querySelectorAll('a.demo').forEach(function (a) {
      var q = a.dataset.q;
      if (!q) return;
      a.href = SRC[state.settings.source].url(q);
    });
  }

  /* ---------- 事件 ---------- */
  function bind() {
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t.classList && t.classList.contains('cb')) {
        var id = t.dataset.id;
        if (t.checked) state.checks[id] = true; else delete state.checks[id];
        save();
        var row = t.closest('.row');
        if (row) row.classList.toggle('is-done', t.checked);
        renderProgress();
      }
    });

    document.addEventListener('click', function (e) {
      // 展开备注
      var nt = e.target.closest('.note-toggle');
      if (nt) {
        e.stopPropagation();
        var row = nt.closest('.row');
        var open = row.classList.toggle('open');
        nt.textContent = open ? '收起' : '展开';
        return;
      }
      // 点行切换勾选（避开链接与按钮）
      var rb = e.target.closest('.rb');
      if (rb && !e.target.closest('a')) {
        var cb = rb.closest('.row').querySelector('.cb');
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      // 脚步版本切换
      var sb = e.target.closest('.seg-btn');
      if (sb) {
        var blockId = sb.closest('.seg').dataset.block;
        state.variant[blockId] = sb.dataset.key;
        save();
        renderDays();
        renderProgress();
        return;
      }
      // 搜索源
      var srcBtn = e.target.closest('.src-btn');
      if (srcBtn) {
        state.settings.source = srcBtn.dataset.src;
        save();
        renderSourceUI();
        return;
      }
      // 全部备注
      var allBtn = document.getElementById('toggle-all-notes');
      if (allBtn && allBtn.contains(e.target)) {
        state.settings.expandAll = !state.settings.expandAll;
        save();
        applyNotesSetting();
        return;
      }
    });

    // 清空本日
    document.querySelectorAll('[data-clear]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var dayId = btn.dataset.clear;
        if (btn.dataset.confirm !== '1') {
          btn.dataset.confirm = '1';
          var old = btn.textContent;
          btn.textContent = '再点一次清空';
          setTimeout(function () { btn.dataset.confirm = '0'; btn.textContent = old; }, 3000);
          return;
        }
        var day = window.PLAN.days.filter(function (d) { return d.id === dayId; })[0];
        if (!day) return;
        day.blocks.forEach(function (b) {
          itemsOf(b).forEach(function (i) { delete state.checks[i.id]; });
        });
        save();
        renderDays();
        renderProgress();
        btn.dataset.confirm = '0';
        btn.textContent = '清空本日';
      });
    });

    // 结束本轮
    var endBtn = document.getElementById('end-cycle');
    if (endBtn) {
      endBtn.addEventListener('click', function () {
        if (endBtn.dataset.confirm !== '1') {
          endBtn.dataset.confirm = '1';
          endBtn.classList.add('armed');
          endBtn.querySelector('.ec-sub').textContent = '再点一次确认结束第 ' + state.cycle + ' 轮';
          setTimeout(function () {
            endBtn.dataset.confirm = '0';
            endBtn.classList.remove('armed');
            renderProgress();
          }, 4000);
          return;
        }
        var c = cycleStats();
        state.history.unshift({
          cycle: state.cycle,
          start: state.startedAt,
          end: today(),
          done: c.done,
          total: c.total,
          days: c.daysTrained
        });
        state.totals.cycles += 1;
        state.totals.actions += c.done;
        state.totals.days += c.daysTrained;
        state.cycle += 1;
        state.startedAt = today();
        state.checks = {};
        save();
        endBtn.dataset.confirm = '0';
        endBtn.classList.remove('armed');
        renderDays();
        renderProgress();
        renderHistory();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    // 导出记录
    var exportBtn = document.getElementById('export-data');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        var payload = { app: 'training-plan', version: 1, exportedAt: new Date().toISOString(), state: state };
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = '训练记录-' + today() + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
        ioStatus('已导出 训练记录-' + today() + '.json');
      });
    }

    // 导入记录
    var importBtn = document.getElementById('import-data');
    var importInput = document.getElementById('import-file');
    if (importBtn && importInput) {
      importBtn.addEventListener('click', function () { importInput.click(); });
      importInput.addEventListener('change', function () {
        var f = importInput.files && importInput.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          var incoming;
          try {
            incoming = JSON.parse(String(reader.result));
          } catch (err) {
            ioStatus('文件不是有效的 JSON');
            importInput.value = '';
            return;
          }
          var s = incoming && incoming.state ? incoming.state : incoming;
          if (!s || typeof s !== 'object' || !s.checks) {
            ioStatus('这个文件不是训练记录');
            importInput.value = '';
            return;
          }
          state = {
            cycle: s.cycle || 1,
            startedAt: s.startedAt || today(),
            checks: s.checks || {},
            variant: s.variant || {},
            history: s.history || [],
            totals: s.totals || { cycles: 0, actions: 0, days: 0 },
            settings: s.settings || { source: 'bilibili', expandAll: false }
          };
          save();
          renderDays();
          renderProgress();
          renderHistory();
          renderSourceUI();
          applyNotesSetting();
          ioStatus('已恢复到第 ' + state.cycle + ' 轮 · ' + state.history.length + ' 条历史');
          importInput.value = '';
        };
        reader.readAsText(f);
      });
    }

    // 重置全部
    var resetBtn = document.getElementById('reset-all');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (resetBtn.dataset.confirm !== '1') {
          resetBtn.dataset.confirm = '1';
          resetBtn.textContent = '再点一次，记录将全部删除';
          setTimeout(function () { resetBtn.dataset.confirm = '0'; resetBtn.textContent = '清除全部记录，从第 1 轮重新开始'; }, 4000);
          return;
        }
        state = JSON.parse(JSON.stringify(DEFAULT));
        state.startedAt = today();
        save();
        resetBtn.dataset.confirm = '0';
        resetBtn.textContent = '清除全部记录，从第 1 轮重新开始';
        renderDays();
        renderProgress();
        renderHistory();
        renderSourceUI();
      });
    }

    // 导航高亮
    var links = document.querySelectorAll('.nav a');
    links.forEach(function (a) {
      a.addEventListener('click', function () {
        links.forEach(function (x) { x.classList.remove('on'); });
        a.classList.add('on');
      });
    });
  }

  function applyNotesSetting() {
    document.body.classList.toggle('notes-open', !!state.settings.expandAll);
    var btn = document.getElementById('toggle-all-notes');
    if (btn) btn.textContent = state.settings.expandAll ? '收起备注' : '全部备注';
  }

  function init() {
    document.getElementById('today-label').textContent = (function () {
      var d = new Date();
      var wk = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
      return (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + wk;
    })();
    renderStatic();
    renderDays();
    renderProgress();
    renderHistory();
    renderSourceUI();
    applyNotesSetting();
    bind();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
