const corpus = window.ONOMATOPOEIA_CORPUS;

const state = {
  mode: "word",
  query: "",
  selected: new Set(),
  selectedKeitai: new Set(),
  selectedUsage: new Set(),
  books: new Set(),
  sort: "candidate",
  view: "parallel",
  page: 1,
  pageSize: 24,
};

const els = {
  modeButtons: document.querySelectorAll(".mode-button"),
  searchLabel: document.querySelector("#searchLabel"),
  listLabel: document.querySelector("#listLabel"),
  candidateSearch: document.querySelector("#candidateSearch"),
  candidateList: document.querySelector("#candidateList"),
  candidateCount: document.querySelector("#candidateCount"),
  selectAllButton: document.querySelector("#selectAllButton"),
  clearButton: document.querySelector("#clearButton"),
  bookMultiSelect: document.querySelector("#bookMultiSelect"),
  bookFilterButton: document.querySelector("#bookFilterButton"),
  bookFilterLabel: document.querySelector("#bookFilterLabel"),
  bookFilterMenu: document.querySelector("#bookFilterMenu"),
  bookFilterList: document.querySelector("#bookFilterList"),
  bookSelectAllButton: document.querySelector("#bookSelectAllButton"),
  bookClearButton: document.querySelector("#bookClearButton"),
  usageMultiSelect: document.querySelector("#usageMultiSelect"),
  usageFilterButton: document.querySelector("#usageFilterButton"),
  usageFilterLabel: document.querySelector("#usageFilterLabel"),
  usageFilterMenu: document.querySelector("#usageFilterMenu"),
  usageFilterList: document.querySelector("#usageFilterList"),
  usageSelectAllButton: document.querySelector("#usageSelectAllButton"),
  usageClearButton: document.querySelector("#usageClearButton"),
  statTargetItems: document.querySelector("#statTargetItems"),
  statResults: document.querySelector("#statResults"),
  statBooks: document.querySelector("#statBooks"),
  statKeitai: document.querySelector("#statKeitai"),
  resultsTitle: document.querySelector("#resultsTitle"),
  resultList: document.querySelector("#resultList"),
  resultMeta: document.querySelector("#resultMeta"),
  pageInfo: document.querySelector("#pageInfo"),
  prevPage: document.querySelector("#prevPage"),
  nextPage: document.querySelector("#nextPage"),
  sortMode: document.querySelector("#sortMode"),
  selectionSummary: document.querySelector("#selectionSummary"),
  themeButton: document.querySelector("#themeButton"),
  viewButtons: document.querySelectorAll(".view-button"),
  usageFilterBlock: document.querySelector("#usageFilterBlock"),
};

const numberFormat = new Intl.NumberFormat("ja-JP");
const candidatesByNo = new Map(corpus.candidates.map((item) => [item.no, item]));
const keitaiByName = new Map(corpus.keitai.map((item) => [item.keitai, item]));
const usageByNo = new Map((corpus.usage_classes || []).map((item) => [item.no, item]));
const resultsByCandidate = new Map();
for (const row of corpus.results) {
  if (!resultsByCandidate.has(row.candidate_no)) {
    resultsByCandidate.set(row.candidate_no, []);
  }
  resultsByCandidate.get(row.candidate_no).push(row);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(value) {
  return String(value ?? "").toLocaleLowerCase("ja-JP");
}

function visibleCandidates() {
  const query = normalize(state.query);
  return corpus.candidates.filter((candidate) => {
    if (!query) return true;
    const haystack = [
      candidate.no,
      candidate.label,
      candidate.lemma,
      candidate.surface,
      ...(candidate.variants || []),
    ]
      .join(" ")
      .toLocaleLowerCase("ja-JP");
    return haystack.includes(query);
  });
}

function visibleKeitai() {
  const query = normalize(state.query);
  return corpus.keitai.filter((item) => {
    if (!query) return true;
    return normalize(item.keitai).includes(query);
  });
}

function visibleUsageClasses() {
  return usageClassItems({ applyQuery: true });
}

function candidateNumbersForKeitai(forms) {
  return corpus.candidates
    .filter((candidate) => forms.has(candidate.keitai))
    .map((candidate) => candidate.no);
}

function selectedCandidateNumbers() {
  if (state.mode === "usage") {
    return corpus.candidates.map((candidate) => candidate.no);
  }
  if (state.mode === "keitai") {
    const forms = state.selectedKeitai.size
      ? state.selectedKeitai
      : new Set(visibleKeitai().map((item) => item.keitai));
    return candidateNumbersForKeitai(forms).sort((a, b) => a - b);
  }
  if (state.selected.size) {
    return [...state.selected].sort((a, b) => a - b);
  }
  return visibleCandidates().map((candidate) => candidate.no);
}

function selectedUsageNumbers() {
  if (state.selectedUsage.size) {
    return [...state.selectedUsage].sort((a, b) => a - b);
  }
  if (state.mode !== "usage") return [];
  return visibleUsageClasses().map((item) => item.no);
}

function baseRowsForCurrentScope() {
  const selected = new Set(selectedCandidateNumbers());
  let rows = corpus.results.filter((row) => selected.has(row.candidate_no));
  if (state.books.size) {
    rows = rows.filter((row) => state.books.has(row.work_id));
  }
  return rows;
}

function usageCountsForCurrentScope() {
  const counts = new Map((corpus.usage_classes || []).map((item) => [item.no, 0]));
  for (const row of baseRowsForCurrentScope()) {
    const number = Number(row.usage_class_no);
    counts.set(number, (counts.get(number) || 0) + 1);
  }
  return counts;
}

function usageClassItems({ applyQuery = false } = {}) {
  const query = applyQuery ? normalize(state.query) : "";
  const counts = usageCountsForCurrentScope();
  return (corpus.usage_classes || [])
    .map((item) => ({
      ...item,
      current_count: counts.get(item.no) || 0,
    }))
    .filter((item) => {
      if (!query) return true;
      return normalize([item.no, item.expression, item.class].join(" ")).includes(query);
    })
    .sort((a, b) => {
      const aEmpty = a.current_count === 0 ? 1 : 0;
      const bEmpty = b.current_count === 0 ? 1 : 0;
      return aEmpty - bEmpty || b.current_count - a.current_count || a.no - b.no;
    });
}

function filteredResults() {
  let rows = baseRowsForCurrentScope();
  if (state.mode === "usage" || state.selectedUsage.size) {
    const usages = new Set(selectedUsageNumbers());
    rows = rows.filter((row) => usages.has(Number(row.usage_class_no)));
  }
  rows = [...rows];
  rows.sort((a, b) => {
    if (state.sort === "book") {
      return (
        a.work_id.localeCompare(b.work_id) ||
        Number(a.sentence_index) - Number(b.sentence_index) ||
        Number(String(a.token_ids).split(";")[0]) - Number(String(b.token_ids).split(";")[0])
      );
    }
    return (
      a.candidate_no - b.candidate_no ||
      a.work_id.localeCompare(b.work_id) ||
      Number(a.sentence_index) - Number(b.sentence_index) ||
      Number(String(a.token_ids).split(";")[0]) - Number(String(b.token_ids).split(";")[0])
    );
  });
  return rows;
}

function renderBooks() {
  els.bookFilterList.innerHTML = corpus.books
    .map(
      (book) => `
        <label class="book-filter-item">
          <input type="checkbox" data-book="${escapeHtml(book.work_id)}" />
          <span>${escapeHtml(book.work_id)} · ${escapeHtml(book.title_ja)}</span>
        </label>
      `,
    )
    .join("");
  renderBookLabel();
}

function renderUsageFilter() {
  els.usageFilterList.innerHTML = usageClassItems()
    .map(
      (usage) => `
        <label class="book-filter-item usage-filter-item ${usage.current_count ? "" : "is-empty"}">
          <input type="checkbox" data-usage-filter="${usage.no}" />
          <span>${String(usage.no).padStart(2, "0")} · ${escapeHtml(usage.expression)} · ${escapeHtml(usage.class)} (${numberFormat.format(usage.current_count)})</span>
        </label>
      `,
    )
    .join("");
  renderUsageLabel();
}

function renderBookLabel() {
  if (!state.books.size) {
    els.bookFilterLabel.textContent = "すべて";
    return;
  }
  if (state.books.size === corpus.books.length) {
    els.bookFilterLabel.textContent = "全作品";
    return;
  }
  const labels = corpus.books
    .filter((book) => state.books.has(book.work_id))
    .map((book) => book.work_id);
  els.bookFilterLabel.textContent = labels.join(", ");
}

function renderUsageLabel() {
  if (!state.selectedUsage.size) {
    els.usageFilterLabel.textContent = "すべて";
    return;
  }
  const allUsages = corpus.usage_classes || [];
  if (state.selectedUsage.size === allUsages.length) {
    els.usageFilterLabel.textContent = "全用法";
    return;
  }
  const labels = allUsages
    .filter((usage) => state.selectedUsage.has(usage.no))
    .map((usage) => usage.expression);
  if (labels.length <= 2) {
    els.usageFilterLabel.textContent = labels.join(", ");
    return;
  }
  els.usageFilterLabel.textContent = `${labels.slice(0, 2).join(", ")} 他${labels.length - 2}`;
}

function syncBookChecks() {
  els.bookFilterList.querySelectorAll("input[data-book]").forEach((input) => {
    input.checked = state.books.has(input.dataset.book);
  });
}

function syncUsageChecks() {
  els.usageFilterList.querySelectorAll("input[data-usage-filter]").forEach((input) => {
    input.checked = state.selectedUsage.has(Number(input.dataset.usageFilter));
  });
}

function closeBookMenu() {
  els.bookFilterMenu.hidden = true;
  els.bookFilterButton.setAttribute("aria-expanded", "false");
}

function closeUsageMenu() {
  els.usageFilterMenu.hidden = true;
  els.usageFilterButton.setAttribute("aria-expanded", "false");
}

function toggleBookMenu() {
  const nextHidden = !els.bookFilterMenu.hidden;
  els.bookFilterMenu.hidden = nextHidden;
  els.bookFilterButton.setAttribute("aria-expanded", String(!nextHidden));
}

function toggleUsageMenu() {
  const nextHidden = !els.usageFilterMenu.hidden;
  els.usageFilterMenu.hidden = nextHidden;
  els.usageFilterButton.setAttribute("aria-expanded", String(!nextHidden));
}

function renderCandidates() {
  if (state.mode === "usage") {
    const usages = visibleUsageClasses();
    els.searchLabel.textContent = "後接用法検索";
    els.listLabel.textContent = "後接用法";
    els.candidateSearch.placeholder = "例: する / 用言 / 形容詞";
    els.candidateCount.textContent = `${usages.length} / ${(corpus.usage_classes || []).length}`;
    els.candidateList.innerHTML = usages
      .map((item) => {
        const checked = state.selectedUsage.has(item.no) ? "checked" : "";
        return `
          <label class="usage-item">
            <input type="checkbox" data-usage="${item.no}" ${checked} />
            <span class="candidate-name">
              <span class="candidate-no">${String(item.no).padStart(2, "0")}</span>
              <span class="candidate-label">${escapeHtml(item.expression)}</span>
              <span class="keitai-meta">${escapeHtml(item.class)}</span>
            </span>
            <span class="candidate-count">${numberFormat.format(item.current_count)}</span>
          </label>
        `;
      })
      .join("");
    return;
  }

  if (state.mode === "keitai") {
    const forms = visibleKeitai();
    els.searchLabel.textContent = "形態検索";
    els.listLabel.textContent = "形態";
    els.candidateSearch.placeholder = "例: ABAB / AっBり";
    els.candidateCount.textContent = `${forms.length} / ${corpus.keitai.length}`;
    els.candidateList.innerHTML = forms
      .map((item) => {
        const checked = state.selectedKeitai.has(item.keitai) ? "checked" : "";
        return `
          <label class="keitai-item">
            <input type="checkbox" data-keitai="${escapeHtml(item.keitai)}" ${checked} />
            <span class="candidate-name">
              <span class="candidate-label">${escapeHtml(item.keitai)}</span>
              <span class="keitai-meta">${numberFormat.format(item.candidate_count)}語</span>
            </span>
            <span class="candidate-count">${numberFormat.format(item.result_count)}</span>
          </label>
        `;
      })
      .join("");
    return;
  }

  const candidates = visibleCandidates();
  els.searchLabel.textContent = "語彙項目検索";
  els.listLabel.textContent = "対象語彙項目";
  els.candidateSearch.placeholder = "例: どきどき / しっかり";
  els.candidateCount.textContent = `${candidates.length} / ${corpus.candidates.length}`;
  els.candidateList.innerHTML = candidates
    .map((candidate) => {
      const checked = state.selected.has(candidate.no) ? "checked" : "";
      return `
        <label class="candidate-item">
          <input type="checkbox" data-candidate="${candidate.no}" ${checked} />
          <span class="candidate-name">
            <span class="candidate-no">No.${candidate.no}</span>
            <span class="candidate-label">${escapeHtml(candidate.label)}</span>
          </span>
          <span class="candidate-count">${numberFormat.format(candidate.count)}</span>
        </label>
      `;
    })
    .join("");
}

function renderStats(rows) {
  const selected = selectedCandidateNumbers();
  const targetCount =
    state.mode === "usage" ? selectedUsageNumbers().length : selected.length;
  const books = new Set(rows.map((row) => row.work_id));
  const forms = new Set(
    selected
      .map((number) => candidatesByNo.get(number)?.keitai)
      .filter(Boolean),
  );
  els.statTargetItems.textContent = numberFormat.format(targetCount);
  els.statResults.textContent = numberFormat.format(rows.length);
  els.statBooks.textContent = numberFormat.format(books.size);
  els.statKeitai.textContent = numberFormat.format(forms.size);
}

function surfaceSummary(candidate) {
  const list = candidate.top_surfaces || [];
  if (!list.length) return "";
  return list
    .map((item) => `${escapeHtml(item.surface)} ${numberFormat.format(item.count)}`)
    .join(" / ");
}

function renderSelectionSummary(rows) {
  const rowCounts = new Map();
  for (const row of rows) {
    rowCounts.set(row.candidate_no, (rowCounts.get(row.candidate_no) || 0) + 1);
  }
  const selected =
    state.mode === "usage"
      ? [...rowCounts.keys()]
          .sort((a, b) => a - b)
          .map((number) => candidatesByNo.get(number))
          .filter(Boolean)
      : selectedCandidateNumbers()
          .map((number) => candidatesByNo.get(number))
          .filter(Boolean);
  const modeLabel = "検索対象語彙項目";
  const chips = selected
    .map((candidate) => {
      const visibleCount = rowCounts.get(candidate.no) || 0;
      return `
        <span class="selected-chip" title="${escapeHtml(surfaceSummary(candidate))}">
          <strong>No.${candidate.no}</strong>
          <span>${escapeHtml(candidate.label)}</span>
          <em>${numberFormat.format(visibleCount)}</em>
        </span>
      `;
    })
    .join("");
  els.selectionSummary.innerHTML = `
      <div class="selection-panel">
      <div class="selection-panel-head">
        <strong>${escapeHtml(modeLabel)}</strong>
        <span class="muted">${numberFormat.format(selected.length)}項目 / ${numberFormat.format(rows.length)}用例</span>
      </div>
      <div class="selected-chip-list">${chips}</div>
    </div>
  `;
}

function renderPager(rows) {
  const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
  if (state.page > totalPages) state.page = totalPages;
  els.prevPage.disabled = state.page <= 1;
  els.nextPage.disabled = state.page >= totalPages;
  els.pageInfo.textContent = `${state.page} / ${totalPages}`;
  const selected =
    state.mode === "usage"
      ? `${selectedUsageNumbers().length}分類を対象`
      : `${selectedCandidateNumbers().length}項目を対象`;
  els.resultMeta.textContent = `${selected} · ${numberFormat.format(rows.length)}用例`;
}

function tokenText(value) {
  return String(value ?? "").replaceAll("|", " | ");
}

function highlightJapaneseText(text, key) {
  const source = escapeHtml(text);
  const target = String(key ?? "");
  if (!target) return source;
  const pattern = new RegExp(escapeRegExp(escapeHtml(target)), "g");
  return source.replace(pattern, `<mark class="term-highlight">${escapeHtml(target)}</mark>`);
}

function resultCard(row) {
  const score = row.align_score == null ? "" : Number(row.align_score).toFixed(3);
  const note = row.review_note ? `<span class="tag tag-accent">${escapeHtml(row.review_note)}</span>` : "";
  return `
    <article class="result-card">
      <div class="result-top">
        <div>
          <h3>No.${row.candidate_no} ${escapeHtml(row.candidate_label)}</h3>
          <p class="muted">${escapeHtml(row.work_id)} · ${escapeHtml(row.title_ja)} / ${escapeHtml(row.title_zh)}</p>
        </div>
        <div class="tags">
          <span class="tag">${escapeHtml(row.align_type)}</span>
          <span class="tag tag-usage">${escapeHtml(row.usage_expression)}</span>
          ${score ? `<span class="tag">score ${score}</span>` : ""}
          ${note}
        </div>
      </div>
      <div class="kwic">
        <span class="kwic-left">${escapeHtml(tokenText(row.kwic_left))}</span>
        <span class="kwic-key">${escapeHtml(row.key)}</span>
        <span class="kwic-right">${escapeHtml(tokenText(row.kwic_right))}</span>
      </div>
      <div class="parallel">
        <div class="parallel-box">
          <span class="parallel-label">日本語</span>
          <p class="parallel-text">${highlightJapaneseText(row.ja_sentence, row.key)}</p>
        </div>
        <div class="parallel-box">
          <span class="parallel-label">中国語訳</span>
          <p class="parallel-text">${escapeHtml(row.zh_translation)}</p>
        </div>
      </div>
    </article>
  `;
}

function kwicRow(row) {
  return `
    <tr>
      <td class="kwic-context kwic-context-left">
        <span>${escapeHtml(tokenText(row.kwic_left))}</span>
      </td>
      <td class="kwic-table-key">
        <strong>${escapeHtml(row.key)}</strong>
        <small>No.${row.candidate_no} · ${escapeHtml(row.usage_expression)} · ${escapeHtml(row.title_ja)}</small>
      </td>
      <td class="kwic-context">
        <span>${escapeHtml(tokenText(row.kwic_right))}</span>
      </td>
    </tr>
  `;
}

function renderResults(rows) {
  renderPager(rows);
  const start = (state.page - 1) * state.pageSize;
  const pageRows = rows.slice(start, start + state.pageSize);
  if (!pageRows.length) {
    els.resultList.innerHTML = `<div class="empty">条件に合う結果はありません。</div>`;
    return;
  }
  els.resultsTitle.textContent = state.view === "kwic" ? "KWIC一覧" : "対訳用例";
  if (state.view === "kwic") {
    els.resultList.innerHTML = `
      <div class="kwic-table-wrap">
        <table class="kwic-table">
          <thead>
            <tr>
              <th>前文脈</th>
              <th>キー</th>
              <th>後文脈</th>
            </tr>
          </thead>
          <tbody>${pageRows.map(kwicRow).join("")}</tbody>
        </table>
      </div>
    `;
    return;
  }
  els.resultList.innerHTML = pageRows.map(resultCard).join("");
}

function render() {
  els.usageFilterBlock.hidden = state.mode === "usage";
  const rows = filteredResults();
  renderCandidates();
  renderBookLabel();
  syncBookChecks();
  renderUsageFilter();
  renderUsageLabel();
  syncUsageChecks();
  renderStats(rows);
  renderSelectionSummary(rows);
  renderResults(rows);
}

function resetPageAndRender() {
  state.page = 1;
  render();
}

function initEvents() {
  els.candidateSearch.addEventListener("input", (event) => {
    state.query = event.target.value;
    resetPageAndRender();
  });

  els.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      els.modeButtons.forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      state.mode = button.dataset.mode || "word";
      state.query = "";
      els.candidateSearch.value = "";
      resetPageAndRender();
    });
  });

  els.viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      els.viewButtons.forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      state.view = button.dataset.view || "parallel";
      render();
    });
  });

  els.candidateList.addEventListener("change", (event) => {
    const usageInput = event.target.closest("input[data-usage]");
    if (usageInput) {
      const number = Number(usageInput.dataset.usage);
      if (usageInput.checked) {
        state.selectedUsage.add(number);
      } else {
        state.selectedUsage.delete(number);
      }
      resetPageAndRender();
      return;
    }

    const keitaiInput = event.target.closest("input[data-keitai]");
    if (keitaiInput) {
      if (keitaiInput.checked) {
        state.selectedKeitai.add(keitaiInput.dataset.keitai);
      } else {
        state.selectedKeitai.delete(keitaiInput.dataset.keitai);
      }
      resetPageAndRender();
      return;
    }

    const input = event.target.closest("input[data-candidate]");
    if (!input) return;
    const number = Number(input.dataset.candidate);
    if (input.checked) {
      state.selected.add(number);
    } else {
      state.selected.delete(number);
    }
    resetPageAndRender();
  });

  els.selectAllButton.addEventListener("click", () => {
    if (state.mode === "usage") {
      for (const item of visibleUsageClasses()) {
        state.selectedUsage.add(item.no);
      }
      resetPageAndRender();
      return;
    }
    if (state.mode === "keitai") {
      for (const item of visibleKeitai()) {
        state.selectedKeitai.add(item.keitai);
      }
      resetPageAndRender();
      return;
    }
    for (const candidate of visibleCandidates()) {
      state.selected.add(candidate.no);
    }
    resetPageAndRender();
  });

  els.clearButton.addEventListener("click", () => {
    if (state.mode === "usage") {
      state.selectedUsage.clear();
    } else if (state.mode === "keitai") {
      state.selectedKeitai.clear();
    } else {
      state.selected.clear();
    }
    resetPageAndRender();
  });

  els.bookFilterButton.addEventListener("click", () => {
    toggleBookMenu();
  });

  els.usageFilterButton.addEventListener("click", () => {
    toggleUsageMenu();
  });

  els.bookFilterList.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-book]");
    if (!input) return;
    if (input.checked) {
      state.books.add(input.dataset.book);
    } else {
      state.books.delete(input.dataset.book);
    }
    resetPageAndRender();
  });

  els.usageFilterList.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-usage-filter]");
    if (!input) return;
    const number = Number(input.dataset.usageFilter);
    if (input.checked) {
      state.selectedUsage.add(number);
    } else {
      state.selectedUsage.delete(number);
    }
    resetPageAndRender();
  });

  els.bookSelectAllButton.addEventListener("click", () => {
    state.books = new Set(corpus.books.map((book) => book.work_id));
    resetPageAndRender();
  });

  els.bookClearButton.addEventListener("click", () => {
    state.books.clear();
    resetPageAndRender();
  });

  els.usageSelectAllButton.addEventListener("click", () => {
    state.selectedUsage = new Set((corpus.usage_classes || []).map((usage) => usage.no));
    resetPageAndRender();
  });

  els.usageClearButton.addEventListener("click", () => {
    state.selectedUsage.clear();
    resetPageAndRender();
  });

  document.addEventListener("click", (event) => {
    if (!els.bookMultiSelect.contains(event.target)) {
      closeBookMenu();
    }
    if (!els.usageMultiSelect.contains(event.target)) {
      closeUsageMenu();
    }
  });

  els.sortMode.addEventListener("change", (event) => {
    state.sort = event.target.value;
    resetPageAndRender();
  });

  els.prevPage.addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      render();
      els.resultList.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  els.nextPage.addEventListener("click", () => {
    state.page += 1;
    render();
    els.resultList.scrollTo({ top: 0, behavior: "smooth" });
  });

  els.themeButton.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("onomatopoeia-theme", next);
  });
}

function initTheme() {
  const saved = localStorage.getItem("onomatopoeia-theme");
  if (saved) {
    document.documentElement.dataset.theme = saved;
  }
}

function init() {
  initTheme();
  renderBooks();
  renderUsageFilter();
  initEvents();
  render();
}

init();
