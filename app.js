const corpus = window.ONOMATOPOEIA_CORPUS;

const state = {
  mode: "word",
  query: "",
  selected: new Set(),
  selectedKeitai: new Set(),
  books: new Set(),
  sort: "candidate",
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
  statCandidates: document.querySelector("#statCandidates"),
  statSelected: document.querySelector("#statSelected"),
  statResults: document.querySelector("#statResults"),
  statBooks: document.querySelector("#statBooks"),
  resultList: document.querySelector("#resultList"),
  resultMeta: document.querySelector("#resultMeta"),
  pageInfo: document.querySelector("#pageInfo"),
  prevPage: document.querySelector("#prevPage"),
  nextPage: document.querySelector("#nextPage"),
  sortMode: document.querySelector("#sortMode"),
  selectionSummary: document.querySelector("#selectionSummary"),
  themeButton: document.querySelector("#themeButton"),
};

const numberFormat = new Intl.NumberFormat("ja-JP");
const candidatesByNo = new Map(corpus.candidates.map((item) => [item.no, item]));
const keitaiByName = new Map(corpus.keitai.map((item) => [item.keitai, item]));
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

function candidateNumbersForKeitai(forms) {
  return corpus.candidates
    .filter((candidate) => forms.has(candidate.keitai))
    .map((candidate) => candidate.no);
}

function selectedCandidateNumbers() {
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

function filteredResults() {
  const selected = new Set(selectedCandidateNumbers());
  let rows = corpus.results.filter((row) => selected.has(row.candidate_no));
  if (state.books.size) {
    rows = rows.filter((row) => state.books.has(row.work_id));
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

function syncBookChecks() {
  els.bookFilterList.querySelectorAll("input[data-book]").forEach((input) => {
    input.checked = state.books.has(input.dataset.book);
  });
}

function closeBookMenu() {
  els.bookFilterMenu.hidden = true;
  els.bookFilterButton.setAttribute("aria-expanded", "false");
}

function toggleBookMenu() {
  const nextHidden = !els.bookFilterMenu.hidden;
  els.bookFilterMenu.hidden = nextHidden;
  els.bookFilterButton.setAttribute("aria-expanded", String(!nextHidden));
}

function renderCandidates() {
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
  els.searchLabel.textContent = "候補語検索";
  els.listLabel.textContent = "候補語";
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
  const books = new Set(rows.map((row) => row.work_id));
  els.statCandidates.textContent = numberFormat.format(corpus.candidates.length);
  els.statSelected.textContent = numberFormat.format(selected.length);
  els.statResults.textContent = numberFormat.format(rows.length);
  els.statBooks.textContent = numberFormat.format(books.size);
}

function surfaceSummary(candidate) {
  const list = candidate.top_surfaces || [];
  if (!list.length) return "";
  return list
    .map((item) => `${escapeHtml(item.surface)} ${numberFormat.format(item.count)}`)
    .join(" / ");
}

function renderSelectionSummary(rows) {
  const selected = selectedCandidateNumbers()
    .map((number) => candidatesByNo.get(number))
    .filter(Boolean);
  const rowCounts = new Map();
  for (const row of rows) {
    rowCounts.set(row.candidate_no, (rowCounts.get(row.candidate_no) || 0) + 1);
  }
  const selectedLabel = state.selected.size ? `${selected.length}語を選択中` : `${selected.length}語を表示対象`;
  const modeLabel =
    state.mode === "keitai" && state.selectedKeitai.size
      ? `${state.selectedKeitai.size}形態を選択中`
      : selectedLabel;
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
        <span class="muted">${numberFormat.format(rows.length)}件</span>
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
  const selected = state.selected.size
    ? `${state.selected.size}語を選択中`
    : "表示中の候補語を対象";
  els.resultMeta.textContent = `${selected} · ${numberFormat.format(rows.length)}件`;
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
          ${score ? `<span class="tag">score ${score}</span>` : ""}
          ${note}
        </div>
      </div>
      <div class="kwic">
        <span class="kwic-left">${escapeHtml(row.kwic_left)}</span>
        <span class="kwic-key">${escapeHtml(row.key)}</span>
        <span class="kwic-right">${escapeHtml(row.kwic_right)}</span>
      </div>
      <div class="parallel">
        <div class="parallel-box">
          <span class="parallel-label">日本語</span>
          <p class="parallel-text">${escapeHtml(row.ja_sentence)}</p>
        </div>
        <div class="parallel-box">
          <span class="parallel-label">中国語訳</span>
          <p class="parallel-text">${escapeHtml(row.zh_translation)}</p>
        </div>
      </div>
      <div class="token-meta">
        <span>surface: ${escapeHtml(row.surface)}</span>
        <span>lemma: ${escapeHtml(row.lemma)}</span>
        <span>reading: ${escapeHtml(row.lemma_reading)}</span>
        <span>品詞: ${escapeHtml(row.pos)}</span>
        <span>語種: ${escapeHtml(row.goshu)}</span>
        <span>token: ${escapeHtml(row.token_ids)}</span>
      </div>
    </article>
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
  els.resultList.innerHTML = pageRows.map(resultCard).join("");
}

function render() {
  const rows = filteredResults();
  renderCandidates();
  renderBookLabel();
  syncBookChecks();
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

  els.candidateList.addEventListener("change", (event) => {
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
    if (state.mode === "keitai") {
      state.selectedKeitai.clear();
    } else {
      state.selected.clear();
    }
    resetPageAndRender();
  });

  els.bookFilterButton.addEventListener("click", () => {
    toggleBookMenu();
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

  els.bookSelectAllButton.addEventListener("click", () => {
    state.books = new Set(corpus.books.map((book) => book.work_id));
    resetPageAndRender();
  });

  els.bookClearButton.addEventListener("click", () => {
    state.books.clear();
    resetPageAndRender();
  });

  document.addEventListener("click", (event) => {
    if (!els.bookMultiSelect.contains(event.target)) {
      closeBookMenu();
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
  initEvents();
  render();
}

init();
