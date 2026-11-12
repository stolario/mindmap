(() => {
  const $ = (id) => document.getElementById(id);
  const els = {
    board: $('board'), viewport: $('viewport'), world: $('world'), nodesLayer: $('nodesLayer'),
    svg: $('connections'), mapTitle: $('mapTitle'), saveStatus: $('saveStatus'),
    nodeText: $('nodeText'), nodeNotes: $('nodeNotes'), nodeColor: $('nodeColor'),
    imageInput: $('imageInput'), imagePreview: $('imagePreview'),
    editor: $('editor'), editorContent: $('editorContent'), settingsContent: $('settingsContent'), noSelection: $('noSelection'),
    toast: $('toast'), zoomLabel: $('zoomLabel'), emptyHint: $('emptyHint'), contextMenu: $('nodeContextMenu')
  };
  const GAP_X = 290;
  const DEFAULT_ROOT_COLOR = '#2286ab';
  const DEFAULT_CHILD_COLOR = '#ab9222';
  const DEFAULT_LINK_COLOR = '#a0a3b0';
  const DEFAULT_BORDER_WIDTH = 1.7;
  const DEFAULT_ROOT_BORDER_WIDTH = 2.5;
  const DEFAULT_LINK_WIDTH = 1.7;
  const validWidth = (value) => Number.isFinite(value) && value >= .5 && value <= 20;
  // Переводы лежат в i18n.js: по одному словарю на язык, ключи стабильные и не зависят от текста.
  const I18N = window.I18N;
  let language = 'en';
  const trIn = (lang, key) => I18N[lang]?.[key] ?? I18N.en[key] ?? key;
  const tr = (key) => trIn(language, key);
  const sameInAnyLanguage = (text, key) => Object.keys(I18N).some((lang) => text === trIn(lang, key));
  // data-i18n заменяет только собственный текст элемента и не трогает вложенные svg и другие элементы.
  function setOwnText(element, text) {
    for (const node of element.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || !node.nodeValue.trim()) continue;
      node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), () => text);
      return;
    }
    element.append(text);
  }
  function applyLanguage() {
    document.documentElement.lang = language;
    document.querySelectorAll('#languagePicker option').forEach((option) => { option.selected = option.value === language; });
    document.querySelectorAll('[data-i18n]').forEach((element) => setOwnText(element, tr(element.dataset.i18n)));
    for (const attr of ['title', 'aria-label', 'placeholder']) {
      document.querySelectorAll(`[data-i18n-${attr}]`).forEach((element) => element.setAttribute(attr, tr(element.getAttribute(`data-i18n-${attr}`))));
    }
    chromeKey = null;
  }
  const ALIGNMENTS = ['left', 'center', 'right'];
  const DEFAULT_TITLE_ALIGN = 'center';
  const DEFAULT_NOTES_ALIGN = 'left';
  const DEFAULT_BACKGROUND_COLOR = '#f7f8fc';
  const BACKGROUND_STYLES = ['plain', 'wash', 'gradient', 'grid'];
  const DEFAULT_NODE_BACKGROUND_COLOR = '#ffffff';
  const DEFAULT_TITLE_FONT_SIZE = 12;
  const DEFAULT_NOTES_FONT_SIZE = 10;
  const validExtraWidth = (value) => Number.isFinite(value) && value >= -200 && value <= 1000;
  const nodeExtra = (node) => node.extraWidth ?? map.settings?.nodeExtraWidth ?? 0;
  const nodeLeft = (node) => node.x - nodeExtra(node) / 2;
  const nodeExtraH = (node) => node.extraHeight ?? map.settings?.nodeExtraHeight ?? 0;
  const nodeTop = (node) => node.y - nodeExtraH(node) / 2;
  const ROOT_TITLE_FONT_BONUS = 2;
  const validFontSize = (value) => Number.isFinite(value) && value >= 6 && value <= 48;
  const validColor = (value) => /^#[0-9a-f]{6}$/i.test(value);
  const isDarkColor = (hex) => { const n = parseInt(hex.slice(1), 16); return .299 * (n >> 16) + .587 * ((n >> 8) & 255) + .114 * (n & 255) < 150; };
  const isRootNode = (node) => !isFree() && !node.parentId;
  // Корневой узел иерархии по умолчанию сохраняет фирменный фон и чуть более крупный заголовок.
  const nodeBackground = (node) => node.backgroundColor || (isRootNode(node) ? DEFAULT_ROOT_COLOR : map.settings.nodeBackgroundColor);
  const nodeTitleFontSize = (node) => node.titleFontSize ?? map.settings.titleFontSize + (isRootNode(node) ? ROOT_TITLE_FONT_BONUS : 0);
  const nodeNotesFontSize = (node) => node.notesFontSize ?? map.settings.notesFontSize;
  const defaultSettings = () => ({ nodeBackgroundColor: DEFAULT_NODE_BACKGROUND_COLOR, titleFontSize: DEFAULT_TITLE_FONT_SIZE, notesFontSize: DEFAULT_NOTES_FONT_SIZE, backgroundColor: DEFAULT_BACKGROUND_COLOR, nodeBorderWidth: DEFAULT_BORDER_WIDTH, linkWidth: DEFAULT_LINK_WIDTH, titleAlign: DEFAULT_TITLE_ALIGN, notesAlign: DEFAULT_NOTES_ALIGN, nodeExtraWidth: 0, nodeExtraHeight: 0, backgroundStyle: 'wash' });
  let map = { version: 3, language: 'en', mode: 'hierarchical', title: 'My Mind Map', settings: defaultSettings(), nodes: [], links: [] };
  let selectedId = null;
  let selectedLinkId = null;
  let connectionSourceId = null;
  let settingsOpen = false;
  let scale = 1;
  let pan = { x: 0, y: 0 };
  let pointerMode = null;
  let toastTimer;
  let suppressEditor = false;
  let editorShownKey = null;
  let fileHandle = null;
  let changeVersion = 0;
  let unsaved = false;

  const id = () => (globalThis.crypto?.randomUUID?.() ?? `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  // Индекс id → узел строится лениво и пересобирается, когда меняется массив узлов или его длина.
  let nodeIndex = new Map(), indexedNodes = null, indexedLength = -1;
  const getNode = (nodeId) => {
    if (indexedNodes !== map.nodes || indexedLength !== map.nodes.length) {
      nodeIndex = new Map(map.nodes.map((node) => [node.id, node]));
      indexedNodes = map.nodes; indexedLength = map.nodes.length;
    }
    return nodeIndex.get(nodeId);
  };
  const setSelectedNode = (nodeId) => { selectedId = nodeId; selectedLinkId = null; };
  const childrenOf = (parentId) => map.nodes.filter((node) => node.parentId === parentId);
  const rootNodes = () => map.nodes.filter((node) => !node.parentId);
  const rootNode = () => rootNodes()[0] || null;
  const isFree = () => map.mode === 'free';
  const treeLinks = () => map.nodes.filter((node) => node.parentId).map((node) => ({ id: `tree-${node.id}`, source: node.parentId, target: node.id, color: node.parentLinkColor, width: node.parentLinkWidth }));
  const getLink = (linkId) => (isFree() ? map.links : treeLinks()).find((link) => link.id === linkId);
  function appendNodes(...nodes) {
    nodes.forEach((node) => {
      node.borderWidth = !isFree() && !node.parentId ? DEFAULT_ROOT_BORDER_WIDTH : map.settings.nodeBorderWidth;
      if (node.parentId) node.parentLinkWidth = map.settings.linkWidth;
    });
    map.nodes.push(...nodes);
  }
  function updateLink(property, value) {
    const link = getLink(selectedLinkId);
    if (!link) return;
    if (isFree()) link[property] = value;
    else getNode(link.target)[property === 'color' ? 'parentLinkColor' : 'parentLinkWidth'] = value;
    draw(); markDirty();
  }
  const esc = (str) => String(str ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function createStarter(mode = 'hierarchical') {
    selectedLinkId = null;
    connectionSourceId = null;
    const rootTitle = tr('myMindMap');
    const root = { id: id(), parentId: null, text: rootTitle, notes: '', color: mode === 'free' ? DEFAULT_CHILD_COLOR : DEFAULT_ROOT_COLOR, image: '', x: 0, y: 0 };
    map = { version: 3, language, mode, title: rootTitle, settings: defaultSettings(), links: [], nodes: mode === 'free' ? [root] : [root,
      { id: id(), parentId: root.id, text: tr('mainIdea'), notes: tr('describeTheMapSTopic'), color: '#ed9d62', image: '', x: 0, y: 0 },
      { id: id(), parentId: root.id, text: tr('research'), notes: tr('collectFactsAndUsefulSources'), color: '#5db7a4', image: '', x: 0, y: 0 },
      { id: id(), parentId: root.id, text: tr('nextSteps'), notes: tr('turnIdeasIntoAConcrete'), color: '#ae83d9', image: '', x: 0, y: 0 }
    ]};
    map.nodes.forEach((node) => { node.borderWidth = mode !== 'free' && !node.parentId ? DEFAULT_ROOT_BORDER_WIDTH : DEFAULT_BORDER_WIDTH; if (node.parentId) node.parentLinkWidth = DEFAULT_LINK_WIDTH; });
    layoutTree();
    selectedId = root.id;
  }

  let fittedTitle = null;
  function fitTitleWidth() {
    const input = els.mapTitle;
    fittedTitle = input.value;
    const context = (fitTitleWidth.canvas ??= document.createElement('canvas')).getContext('2d');
    context.font = getComputedStyle(input).font;
    input.style.maxWidth = '100%';
    input.style.width = `${Math.ceil(context.measureText(input.value || input.placeholder || '').width) + 12}px`;
  }

  function markDirty() {
    changeVersion++;
    unsaved = true;
    els.saveStatus.classList.add('saving');
    els.saveStatus.lastChild.textContent = tr('unsaved');
  }

  function setFileStatus(message) {
    unsaved = false;
    els.saveStatus.classList.remove('saving');
    els.saveStatus.lastChild.textContent = tr(message);
  }

  function showToast(message) {
    els.toast.textContent = tr(message);
    els.toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('visible'), 2600);
  }

  function setZoom(next, anchorX, anchorY) {
    const old = scale;
    scale = Math.min(1.8, Math.max(.25, next));
    const rect = els.viewport.getBoundingClientRect();
    const x = anchorX ?? rect.width / 2;
    const y = anchorY ?? rect.height / 2;
    pan.x = x - (x - pan.x) * (scale / old);
    pan.y = y - (y - pan.y) * (scale / old);
    applyView();
  }

  // 3D View — заставка: карта лежит на поле, как пол, уходящий к горизонту. Поле медленно вращается
  // вокруг своей нормали, а наклон плавно качается; верх экрана удаляется и растворяется в фоне,
  // поэтому карта всегда снизу и видна сверху.
  // Поворот не делает полный оборот, а покачивается влево-вправо, чтобы карта не оказывалась вверх ногами.
  const SWING_PERIOD_MS = 40000, SWING_DEG = 25, TILT_PERIOD_MS = 45000, TILT_MIN = 38, TILT_MAX = 58;
  // Камера то наезжает, то отъезжает: сумма двух медленных волн с некратными периодами и случайными
  // фазами выглядит случайной, но остаётся плавной. Множитель приближения — от DIST_MIN до DIST_MAX.
  const DIST_MIN = .8, DIST_MAX = 2.8, DIST_PERIODS_MS = [23000, 37000];
  const view3d = { active: false, raf: 0, start: 0, cx: 0, cy: 0, radius: 1, fullscreen: false, phases: [0, 0] };
  function distance3d(t) {
    const wave = .6 * Math.sin((t / DIST_PERIODS_MS[0]) * Math.PI * 2 + view3d.phases[0])
      + .4 * Math.sin((t / DIST_PERIODS_MS[1]) * Math.PI * 2 + view3d.phases[1]);
    return DIST_MIN + (DIST_MAX - DIST_MIN) * (wave + 1) / 2;
  }
  function frame3d(now) {
    if (!view3d.active) return;
    const t = now - view3d.start;
    const width = els.board.clientWidth, height = els.board.clientHeight;
    const spin = SWING_DEG * Math.sin((t / SWING_PERIOD_MS) * Math.PI * 2);
    const sway = (1 - Math.cos((t / TILT_PERIOD_MS) * Math.PI * 2)) / 2;
    const tilt = TILT_MIN + (TILT_MAX - TILT_MIN) * sway;
    const zoom = Math.min(1.3, .7 * Math.min(width, height * 1.3) / (2 * view3d.radius)) * distance3d(t);
    // Чем ближе камера (меньше perspective), тем шире угол обзора и сильнее перспектива.
    els.viewport.style.perspective = `${Math.max(width, height) * .85}px`;
    els.world.style.transform = `translate(${width / 2}px,${height * .5}px) rotateX(${tilt}deg) rotateZ(${spin}deg) scale(${zoom}) translate(${-view3d.cx}px,${-view3d.cy}px)`;
    view3d.raf = requestAnimationFrame(frame3d);
  }
  function enter3d() {
    if (view3d.active || !map.nodes.length) return;
    connectionSourceId = null; els.contextMenu.hidden = true; els.editor.classList.remove('open');
    document.activeElement?.blur?.();
    draw();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const element of els.nodesLayer.children) {
      minX = Math.min(minX, element.offsetLeft); minY = Math.min(minY, element.offsetTop);
      maxX = Math.max(maxX, element.offsetLeft + element.offsetWidth); maxY = Math.max(maxY, element.offsetTop + element.offsetHeight);
    }
    Object.assign(view3d, { active: true, start: performance.now(), fullscreen: false, phases: [Math.random() * Math.PI * 2, Math.random() * Math.PI * 2], cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, radius: Math.max(160, Math.hypot(maxX - minX, maxY - minY) / 2) });
    const floor = $('view3dFloor'), size = Math.max(4000, view3d.radius * 8);
    Object.assign(floor.style, { left: `${view3d.cx - size / 2}px`, top: `${view3d.cy - size / 2}px`, width: `${size}px`, height: `${size}px` });
    document.body.classList.add('view3d');
    $('view3dOverlay').hidden = false;
    els.board.requestFullscreen?.().catch(() => {});
    view3d.raf = requestAnimationFrame(frame3d);
  }
  function exit3d() {
    if (!view3d.active) return;
    view3d.active = false;
    cancelAnimationFrame(view3d.raf);
    document.body.classList.remove('view3d');
    $('view3dOverlay').hidden = true;
    els.viewport.style.perspective = '';
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    applyView();
  }
  $('view3dButton').addEventListener('click', enter3d);
  $('view3dOverlay').addEventListener('click', exit3d);
  $('view3dOverlay').addEventListener('contextmenu', (event) => { event.preventDefault(); exit3d(); });
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) view3d.fullscreen = true;
    else if (view3d.fullscreen) exit3d();
  });

  function applyView() {
    if (view3d.active) return;
    els.world.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${scale})`;
    els.zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    els.board.style.setProperty('--grid-size', `${24 * scale}px`); els.board.style.setProperty('--grid-x', `${pan.x}px`); els.board.style.setProperty('--grid-y', `${pan.y}px`);
  }

  function fitMap() {
    if (!map.nodes.length) return;
    const rect = els.viewport.getBoundingClientRect();
    const boxes = [...els.nodesLayer.querySelectorAll('.node')].filter((el) => !el.hidden && el.offsetWidth)
      .map((el) => ({ l: el.offsetLeft, t: el.offsetTop, r: el.offsetLeft + el.offsetWidth, b: el.offsetTop + el.offsetHeight }));
    if (!boxes.length) return;
    const minX = Math.min(...boxes.map((b) => b.l)), maxX = Math.max(...boxes.map((b) => b.r));
    const minY = Math.min(...boxes.map((b) => b.t)), maxY = Math.max(...boxes.map((b) => b.b));
    const usableW = Math.max(220, rect.width - 100);
    const usableH = Math.max(200, rect.height - 100);
    scale = Math.min(1.4, Math.max(.25, Math.min(usableW / (maxX - minX), usableH / (maxY - minY))));
    pan.x = (rect.width - (maxX - minX) * scale) / 2 - minX * scale;
    pan.y = (rect.height - (maxY - minY) * scale) / 2 - minY * scale;
    applyView();
  }

  function layoutTree() {
    if (isFree()) {
      const columns = Math.max(1, Math.ceil(Math.sqrt(map.nodes.length)));
      let rowY = 60;
      for (let start = 0; start < map.nodes.length; start += columns) {
        const row = map.nodes.slice(start, start + columns);
        let height = 90;
        row.forEach((node, column) => {
          height = Math.max(height, nodeEls.get(node.id)?.offsetHeight || 180);
          node.x = 80 + column * GAP_X;
          node.y = rowY;
        });
        rowY += height + 40;
      }
      draw(); fitMap(); markDirty(); return;
    }
    const roots = rootNodes();
    if (!roots.length) return;
    // Render once at the current coordinates so tree layout can use the cards' real heights.
    // The root includes extra metadata (for example, "3 branches") that estimates miss.
    draw();
    let cursorY = 60;
    const estimateHeight = (node) => {
      const titleLines = Math.max(1, Math.ceil((node.text || '').length / (!node.parentId ? 34 : 30)));
      return 43 + titleLines * 18 + (node.notes ? 34 : 0) + (node.image ? 115 : 0);
    };
    const nodeHeight = (node) => nodeEls.get(node.id)?.offsetHeight || estimateHeight(node);
    const childMap = new Map();
    for (const node of map.nodes) if (node.parentId) (childMap.get(node.parentId) ?? childMap.set(node.parentId, []).get(node.parentId)).push(node);
    const visit = (node, depth) => {
      const children = childMap.get(node.id) || [];
      node.x = 80 + depth * GAP_X;
      if (!children.length) {
        node.y = cursorY;
        const height = nodeHeight(node);
        const center = cursorY + height / 2;
        cursorY += height + 26;
        return { first: center, last: center, center };
      }
      const bounds = children.map((child) => visit(child, depth + 1));
      const middle = Math.floor(bounds.length / 2);
      const center = bounds.length % 2
        ? bounds[middle].center
        : (bounds[middle - 1].center + bounds[middle].center) / 2;
      node.y = center - nodeHeight(node) / 2;
      return { first: bounds[0].first, last: bounds[bounds.length - 1].last, center };
    };
    roots.forEach((root) => {
      visit(root, 0);
      cursorY += 24;
    });
    draw();
    fitMap();
    markDirty();
  }

  function openContextMenu(event, mode, nodeId = null) {
    if (nodeId) selectNode(nodeId);
    const nodeMode = mode === 'node';
    $('contextAddChildButton').hidden = !nodeMode;
    $('contextConnectButton').hidden = !nodeMode || !isFree();
    $('contextDeleteLinkButton').hidden = mode !== 'link';
    $('contextDeleteButton').hidden = !nodeMode;
    $('contextAddRootButton').hidden = mode !== 'canvas';
    const menuWidth = 232;
    const menuHeight = nodeMode ? (isFree() ? 116 : 82) : 44;
    const left = Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8));
    const top = Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8));
    els.contextMenu.style.left = `${left}px`;
    els.contextMenu.style.top = `${top}px`;
    els.contextMenu.dataset.mode = mode;
    const rect = els.viewport.getBoundingClientRect();
    els.contextMenu.dataset.mapX = String((event.clientX - rect.left - pan.x) / scale);
    els.contextMenu.dataset.mapY = String((event.clientY - rect.top - pan.y) / scale);
    els.contextMenu.hidden = false;
    els.contextMenu.focus({ preventScroll: true });
  }

  // Карточки узлов живут между перерисовками: DOM обновляется на месте, innerHTML (и перекодирование
  // картинок) трогается только когда изменились сами данные узла.
  const nodeEls = new Map();
  let drawQueued = false;
  // Перетаскивание и ресайз присылают десятки событий за кадр — перерисовываем не чаще раза за кадр.
  function scheduleDraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => { drawQueued = false; draw(); });
  }

  let chromeKey = null;
  // Подписи и подсказки, зависящие только от режима, языка и состояния «соединяю узлы».
  function syncChrome() {
    syncModePicker();
    const connecting = !!connectionSourceId;
    const key = `${map.mode}|${language}|${connecting}`;
    if (key === chromeKey) return;
    chromeKey = key;
    const free = isFree();
    $('addChildButton').querySelector('span').innerHTML = free ? `${tr('add')}<br>${tr('node')}` : `${tr('add')}<br>${tr('branch')}`;
    $('addChildButton').title = free ? tr('addIndependentNodeEnter') : tr('addChildNodeEnter');
    $('addSiblingButton').querySelector('span').textContent = free ? tr('connect') : tr('sibling');
    $('addSiblingButton').title = free ? tr('connectSelectedNodeToAnother') : tr('addASiblingNode');
    $('addSiblingButton').querySelector('svg').innerHTML = free
      ? '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/>'
      : '<path d="M5 7h8m-8 5h14m-14 5h8M16 5l3 2-3 2m-5 8 3 2-3 2"/>';
    $('contextAddRootButton').querySelector('span').textContent = tr(free ? 'addANewNode' : 'addANewRootNode');
    els.editor.querySelector('.editor-foot .key-hint').innerHTML = `<kbd>Enter</kbd> ${tr(free ? 'newNode' : 'newBranch')}`;
    $('nodeColor').previousElementSibling.textContent = tr(free ? 'nodeColor' : 'branchColor');
    $('nodeColor').setAttribute('aria-label', tr(free ? 'nodeColor' : 'branchColor'));
    els.emptyHint.querySelector('span:last-child').textContent = tr(free ? 'clickAddNodeOrPress' : 'clickAddBranchOrPress');
    const hint = els.board.querySelector('.board-hint');
    hint.textContent = connecting ? tr('chooseASecondNodeEsc') : '';
    hint.classList.toggle('connecting', connecting);
  }

  function renderNode(node, element, kids) {
    const isRoot = !isFree() && !node.parentId;
    element.className = `node${isRoot ? ' root' : ''}${node.id === selectedId ? ' selected' : ''}${node.id === connectionSourceId ? ' link-source' : ''}${node.notes ? ' has-notes' : ' no-notes'}`;
    element.style.left = `${nodeLeft(node)}px`;
    element.style.top = `${nodeTop(node)}px`;
    element.style.setProperty('--node-extra-height', `${nodeExtraH(node)}px`);
    element.style.borderWidth = `${node.borderWidth}px`;
    element.style.setProperty('--node-extra-width', `${nodeExtra(node)}px`);
    const background = nodeBackground(node);
    element.classList.add(isDarkColor(background) ? 'dark-bg' : 'light-bg');
    if (node.showLeftStripe === false) element.classList.add('no-left-stripe');
    if (node.showRightStripe === true) element.classList.add('right-stripe');
    element.style.setProperty('--node-bg', background);
    element.style.setProperty('--title-size', `${nodeTitleFontSize(node)}px`);
    element.style.setProperty('--notes-size', `${nodeNotesFontSize(node)}px`);
    // Выравнивание узла перекрывает общее; без своего значения свойство нужно убрать, иначе оно «залипнет».
    for (const [property, value] of [['--title-align', node.titleAlign], ['--notes-align', node.notesAlign]]) {
      if (value) element.style.setProperty(property, value); else element.style.removeProperty(property);
    }
    element.style.setProperty('--node-color', node.color || (isRoot ? DEFAULT_ROOT_COLOR : DEFAULT_CHILD_COLOR));
    const content = element._content;
    if (content && content.text === node.text && content.notes === node.notes && content.image === node.image && content.kids === kids && content.language === language) return;
    element._content = { text: node.text, notes: node.notes, image: node.image, kids, language };
    const noteMarkup = node.notes ? `<span class="node-notes-preview">${esc(node.notes)}</span>` : '';
    const imageMarkup = node.image ? `<img class="node-image" src="${esc(node.image)}" alt="" draggable="false">` : '';
    const meta = kids ? `<span class="node-meta">${kids} ${tr(kids === 1 ? 'branch2' : 'branches')}</span>` : '';
    element.innerHTML = `<div class="node-body"><span class="node-text">${esc(node.text)}</span>${noteMarkup}${imageMarkup}${meta}</div>`;
  }

  function renderCanvas() {
    const free = isFree();
    const nodes = map.nodes;
    if (document.activeElement !== els.mapTitle) els.mapTitle.value = map.title;
    if (els.mapTitle.value !== fittedTitle) fitTitleWidth();
    els.emptyHint.hidden = nodes.length > 0;
    els.emptyHint.style.display = nodes.length > 0 ? 'none' : 'flex';
    if (nodes.length > 0) els.emptyHint.remove();
    else if (!els.emptyHint.isConnected) els.board.append(els.emptyHint);
    els.board.style.setProperty('--canvas', map.settings.backgroundColor || DEFAULT_BACKGROUND_COLOR);
    els.board.dataset.bgStyle = BACKGROUND_STYLES.includes(map.settings.backgroundStyle) ? map.settings.backgroundStyle : 'wash';
    els.nodesLayer.style.setProperty('--title-align', map.settings.titleAlign || DEFAULT_TITLE_ALIGN);
    els.nodesLayer.style.setProperty('--notes-align', map.settings.notesAlign || DEFAULT_NOTES_ALIGN);

    const kidCounts = new Map();
    if (!free) for (const node of nodes) if (node.parentId) kidCounts.set(node.parentId, (kidCounts.get(node.parentId) || 0) + 1);
    const alive = new Set();
    for (const node of nodes) {
      alive.add(node.id);
      let element = nodeEls.get(node.id);
      if (!element) {
        element = document.createElement('article');
        element.dataset.id = node.id;
        nodeEls.set(node.id, element);
        els.nodesLayer.append(element);
      }
      renderNode(node, element, kidCounts.get(node.id) || 0);
    }
    for (const [nodeId, element] of nodeEls) {
      if (!alive.has(nodeId)) { element.remove(); nodeEls.delete(nodeId); }
    }

    // Все размеры читаем одним проходом после записи в DOM — так браузер считает раскладку один раз.
    const sizes = new Map();
    for (const node of nodes) {
      const element = nodeEls.get(node.id);
      sizes.set(node.id, { w: element.offsetWidth, h: element.offsetHeight });
    }

    const edgeMarkup = [];
    const connections = free ? map.links : treeLinks();
    for (const [linkIndex, link] of connections.entries()) {
      const node = getNode(link.target);
      const parent = getNode(link.source);
      if (!node || !parent) continue;
      const parentSize = sizes.get(parent.id);
      const childSize = sizes.get(node.id);
      const x1 = nodeLeft(parent) + parentSize.w;
      const y1 = nodeTop(parent) + parentSize.h / 2;
      const x2 = nodeLeft(node);
      const y2 = nodeTop(node) + childSize.h / 2;
      const bend = Math.max(36, (x2 - x1) * .48);
      const selected = link.id === selectedLinkId || node.id === selectedId || parent.id === selectedId;
      let path = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
      if (free) {
        const a = { x: nodeLeft(parent) + parentSize.w / 2, y: y1 };
        const b = { x: nodeLeft(node) + childSize.w / 2, y: y2 };
        const dx = b.x - a.x, dy = b.y - a.y;
        const offset = (size) => 1 / Math.max(Math.abs(dx) / (size.w / 2), Math.abs(dy) / (size.h / 2), .0001);
        const ta = offset(parentSize), tb = offset(childSize);
        path = `M ${a.x + dx * ta} ${a.y + dy * ta} L ${b.x - dx * tb} ${b.y - dy * tb}`;
      }
      const marker = `arrow-link-${linkIndex}`;
      const color = esc(link.color || DEFAULT_LINK_COLOR);
      const width = link.width;
      const arrowSize = Math.max(10, width * 2.5);
      if (free) edgeMarkup.push(`<defs><marker id="${marker}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="${arrowSize}" markerHeight="${arrowSize}" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 1 1 L 9 5 L 1 9 Z" fill="${color}"/></marker></defs>`);
      const direction = link.direction || 'forward';
      const markers = !free ? '' : `${direction !== 'forward' ? ` marker-start="url(#${marker})"` : ''}${direction !== 'reverse' ? ` marker-end="url(#${marker})"` : ''}`;
      edgeMarkup.push(`<path class="edge${selected ? ' edge-active' : ''}${link.id === selectedLinkId ? ' edge-selected' : ''}" d="${path}"${markers} style="stroke-width:${width};${free || link.color ? `stroke:${color}` : ''}"/>`);
      edgeMarkup.push(`<path class="edge-hit" data-link-id="${esc(link.id)}" d="${path}" style="stroke-width:${Math.max(14, width + 10)}"/>`);
    }
    if (nodes.length) {
      // Границы SVG считаем по реальным размерам карточек (с учётом доп. ширины, картинок и заметок).
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const node of nodes) {
        const { w, h } = sizes.get(node.id);
        minX = Math.min(minX, nodeLeft(node)); minY = Math.min(minY, nodeTop(node));
        maxX = Math.max(maxX, nodeLeft(node) + w); maxY = Math.max(maxY, nodeTop(node) + h);
      }
      const pad = 40;
      minX -= pad; minY -= pad; maxX += pad; maxY += pad;
      els.svg.style.left = `${minX}px`;
      els.svg.style.top = `${minY}px`;
      els.svg.setAttribute('width', String(maxX - minX));
      els.svg.setAttribute('height', String(maxY - minY));
      els.svg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
    }
    els.svg.innerHTML = edgeMarkup.join('');
  }

  // draw() = подписи интерфейса + холст + панель свойств. Каждый шаг — отдельная функция без скрытых связей:
  // выбор узла/связи меняют только selectNode, selectLink и setSelectedNode, а не отрисовка.
  function draw() {
    syncChrome();
    renderCanvas();
    syncEditor();
  }

  // Один обработчик на слой вместо трёх на каждый узел и на каждую связь.
  const nodeIdOf = (event) => event.target.closest?.('.node')?.dataset.id;
  els.nodesLayer.addEventListener('pointerdown', beginNodePointer);
  els.nodesLayer.addEventListener('click', (event) => {
    const nodeId = nodeIdOf(event);
    if (!nodeId) return;
    event.stopPropagation();
    if (connectionSourceId) completeConnection(nodeId); else selectNode(nodeId);
  });
  els.nodesLayer.addEventListener('contextmenu', (event) => {
    const nodeId = nodeIdOf(event);
    if (!nodeId) return;
    event.preventDefault();
    event.stopPropagation();
    openContextMenu(event, 'node', nodeId);
  });
  els.nodesLayer.addEventListener('dblclick', (event) => {
    const nodeId = nodeIdOf(event);
    if (!nodeId) return;
    event.stopPropagation();
    selectNode(nodeId);
    els.nodeText.focus();
  });
  const linkIdOf = (event) => event.target.closest?.('[data-link-id]')?.dataset.linkId;
  els.svg.addEventListener('pointerdown', (event) => {
    const linkId = linkIdOf(event);
    if (!linkId || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); selectLink(linkId);
  });
  els.svg.addEventListener('contextmenu', (event) => {
    const linkId = linkIdOf(event);
    if (!linkId) return;
    event.preventDefault(); event.stopPropagation();
    selectLink(linkId);
    els.contextMenu.dataset.linkId = linkId;
    openContextMenu(event, 'link');
  });

  function selectNode(nodeId) {
    selectedLinkId = null;
    selectedId = nodeId;
    draw();
    if (window.matchMedia('(max-width: 760px)').matches) els.editor.classList.add('open');
  }

  function selectLink(linkId) {
    if (!getLink(linkId)) return;
    selectedLinkId = linkId; selectedId = null; connectionSourceId = null; settingsOpen = false;
    draw();
    if (window.matchMedia('(max-width: 760px)').matches) els.editor.classList.add('open');
  }

  function syncEditor() {
    const node = getNode(selectedId);
    const link = getLink(selectedLinkId);
    const kicker = $('editorKicker');
    const title = $('editorTitle');
    els.editor.classList.toggle('settings-mode', settingsOpen);
    document.querySelector('.workspace').classList.toggle('no-editor', !settingsOpen && !node && !link);
    els.settingsContent.hidden = !settingsOpen;
    els.editorContent.hidden = settingsOpen || !node;
    $('linkEditorContent').hidden = settingsOpen || !link;
    els.noSelection.hidden = settingsOpen || !!node || !!link;
    kicker.textContent = tr(settingsOpen ? 'settingsCaps' : 'properties');
    title.textContent = tr(settingsOpen ? 'mapSettings' : link ? 'linkBetweenNodes' : 'mapNode');
    if (document.activeElement !== $('allNodeBorderWidth')) $('allNodeBorderWidth').value = map.settings.nodeBorderWidth;
    if (document.activeElement !== $('nodeExtraWidth')) $('nodeExtraWidth').value = map.settings.nodeExtraWidth || 0;
    if (document.activeElement !== $('nodeExtraHeight')) $('nodeExtraHeight').value = map.settings.nodeExtraHeight || 0;
    if (document.activeElement !== $('allLinkWidth')) $('allLinkWidth').value = map.settings.linkWidth;
    $('allNodeBackgroundColor').value = map.settings.nodeBackgroundColor;
    $('allNodeBackgroundColorValue').textContent = map.settings.nodeBackgroundColor.toUpperCase();
    if (document.activeElement !== $('allTitleFontSize')) $('allTitleFontSize').value = map.settings.titleFontSize;
    if (document.activeElement !== $('allNotesFontSize')) $('allNotesFontSize').value = map.settings.notesFontSize;
    $('backgroundColor').value = map.settings.backgroundColor || DEFAULT_BACKGROUND_COLOR;
    $('backgroundStyle').value = BACKGROUND_STYLES.includes(map.settings.backgroundStyle) ? map.settings.backgroundStyle : 'wash';
    $('backgroundColorValue').textContent = (map.settings.backgroundColor || DEFAULT_BACKGROUND_COLOR).toUpperCase();
    for (const [key, fallback] of [['titleAlign', DEFAULT_TITLE_ALIGN], ['notesAlign', DEFAULT_NOTES_ALIGN]]) {
      $(key).querySelectorAll('input').forEach((input) => { input.checked = input.value === (map.settings[key] || fallback); });
    }
    if (settingsOpen) return;
    // Поля редактора не перезаписываются, пока в них фокус, — но только если показан тот же элемент.
    const shownKey = link ? `link:${link.id}` : node ? `node:${node.id}` : null;
    const switched = shownKey !== editorShownKey;
    editorShownKey = shownKey;
    if (link) {
      $('linkSourceName').textContent = getNode(link.source)?.text || tr('untitled');
      $('linkTargetName').textContent = getNode(link.target)?.text || tr('untitled');
      $('linkDirection').querySelectorAll('input').forEach((input) => { input.checked = input.value === (link.direction || 'forward'); });
      $('linkColor').value = link.color || DEFAULT_LINK_COLOR;
      $('linkDirection').hidden = !isFree();
      if (switched || document.activeElement !== $('linkWidth')) $('linkWidth').value = link.width;
      $('deleteLinkButton').textContent = tr(isFree() ? 'deleteLink' : 'detachBranch');
      return;
    }
    if (!node) return;
    suppressEditor = true;
    if (switched || document.activeElement !== els.nodeText) els.nodeText.value = node.text || '';
    if (switched || document.activeElement !== els.nodeNotes) els.nodeNotes.value = node.notes || '';
    els.nodeColor.value = node.color || (isFree() || node.parentId ? DEFAULT_CHILD_COLOR : DEFAULT_ROOT_COLOR);
    if (switched || document.activeElement !== $('nodeExtraWidthOwn')) $('nodeExtraWidthOwn').value = node.extraWidth ?? map.settings.nodeExtraWidth ?? 0;
    if (switched || document.activeElement !== $('nodeExtraHeightOwn')) $('nodeExtraHeightOwn').value = node.extraHeight ?? map.settings.nodeExtraHeight ?? 0;
    if (switched || document.activeElement !== $('nodeBorderWidth')) $('nodeBorderWidth').value = node.borderWidth;
    $('nodeBackgroundColor').value = nodeBackground(node);
    // У корневого узла иерархии полосок нет, поэтому и переключатели для него не показываем.
    $('nodeLeftStripeRow').hidden = $('nodeRightStripeRow').hidden = isRootNode(node);
    $('nodeShowLeftStripe').checked = node.showLeftStripe !== false;
    $('nodeShowRightStripe').checked = node.showRightStripe === true;
    if (switched || document.activeElement !== $('nodeTitleFontSize')) $('nodeTitleFontSize').value = nodeTitleFontSize(node);
    if (switched || document.activeElement !== $('nodeNotesFontSize')) $('nodeNotesFontSize').value = nodeNotesFontSize(node);
    for (const [pickerId, key, fallback] of [['nodeTitleAlign', 'titleAlign', DEFAULT_TITLE_ALIGN], ['nodeNotesAlign', 'notesAlign', DEFAULT_NOTES_ALIGN]]) {
      $(pickerId).querySelectorAll('input').forEach((input) => { input.checked = input.value === (node[key] || map.settings[key] || fallback); });
    }
    $('nodeLinksSection').hidden = !isFree();
    $('nodeLinksList').replaceChildren();
    if (isFree()) {
      const links = map.links.filter((link) => link.source === node.id || link.target === node.id);
      for (const link of links) {
        const other = getNode(link.source === node.id ? link.target : link.source);
        if (!other) continue;
        const row = document.createElement('div'); row.className = 'node-link-row';
        const label = document.createElement('span'); label.textContent = other.text || tr('untitled');
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.title = tr('deleteLink');
        remove.setAttribute('aria-label', `${tr('deleteLinkTo')} ${other.text || tr('untitledNode')}`);
        remove.addEventListener('click', () => removeLink(link.id));
        row.append(label, remove); $('nodeLinksList').append(row);
      }
    }
    if (node.image) {
      els.imagePreview.hidden = false;
      els.imagePreview.innerHTML = `<img src="${esc(node.image)}" alt="${esc(tr('imagePreview'))}"><button class="remove-image" type="button" title="${esc(tr('removeImage'))}" aria-label="${esc(tr('removeImage'))}">×</button>`;
      els.imagePreview.querySelector('button').addEventListener('click', () => { node.image = ''; draw(); markDirty(); });
    } else {
      els.imagePreview.hidden = true;
      els.imagePreview.replaceChildren();
    }
    suppressEditor = false;
  }

  function addChild() {
    if (isFree()) {
      const node = getNode(selectedId);
      const rect = els.viewport.getBoundingClientRect();
      addRootAt(node ? node.x + GAP_X + 109 : (rect.width / 2 - pan.x) / scale,
        node ? node.y + 36 : (rect.height / 2 - pan.y) / scale);
      return;
    }
    const parent = getNode(selectedId) || rootNode();
    if (!parent) {
      const node = { id: id(), parentId: null, text: tr('newIdea'), notes: '', color: DEFAULT_ROOT_COLOR, image: '', x: 80, y: 60 };
      appendNodes(node); setSelectedNode(node.id); draw(); markDirty(); els.nodeText.focus(); els.nodeText.select(); return;
    }
    const siblings = childrenOf(parent.id);
    const child = { id: id(), parentId: parent.id, text: tr('newIdea'), notes: '', color: DEFAULT_CHILD_COLOR, image: '', x: parent.x + GAP_X, y: parent.y + siblings.length * 118 };
    appendNodes(child);
    setSelectedNode(child.id);
    draw();
    markDirty();
    if (siblings.length === 0) fitMap();
    els.nodeText.focus();
    els.nodeText.select();
  }

  // Произвольный режим: «дочерний» узел — это новый узел со связью от выбранного к нему.
  function addLinkedChild() {
    const parent = getNode(selectedId);
    if (!parent) { showToast('selectANodeFirst'); return; }
    const outgoing = map.links.filter((link) => link.source === parent.id).length;
    const child = { id: id(), parentId: null, text: tr('newIdea'), notes: '', color: DEFAULT_CHILD_COLOR, image: '', x: parent.x + GAP_X, y: parent.y + outgoing * 118 };
    appendNodes(child);
    map.links.push({ id: id(), source: parent.id, target: child.id, direction: 'forward', color: DEFAULT_LINK_COLOR, width: map.settings.linkWidth });
    setSelectedNode(child.id);
    draw();
    markDirty();
    els.nodeText.focus();
    els.nodeText.select();
  }

  function addRootAt(x, y) {
    const node = { id: id(), parentId: null, text: tr('newIdea'), notes: '', color: isFree() ? DEFAULT_CHILD_COLOR : DEFAULT_ROOT_COLOR, image: '', x: x - (isFree() ? 109 : 122), y: y - (isFree() ? 36 : 41) };
    appendNodes(node);
    setSelectedNode(node.id);
    draw();
    markDirty();
    els.nodeText.focus();
    els.nodeText.select();
  }

  function addSibling() {
    if (isFree()) { startConnection(); return; }
    const current = getNode(selectedId);
    if (!current || !current.parentId) { addChild(); return; }
    const parent = getNode(current.parentId);
    const siblings = childrenOf(parent.id);
    const sibling = { id: id(), parentId: parent.id, text: tr('newIdea'), notes: '', color: current.color || DEFAULT_CHILD_COLOR, image: '', x: parent.x + GAP_X, y: Math.max(...siblings.map((item) => item.y)) + 118 };
    appendNodes(sibling); setSelectedNode(sibling.id); draw(); markDirty(); els.nodeText.focus(); els.nodeText.select();
  }

  let confirmResolve = null;
  function closeConfirm(result) {
    if (!confirmResolve) return;
    const resolve = confirmResolve;
    confirmResolve = null;
    $('confirmDialog').hidden = true;
    resolve(result);
  }
  function confirmDialog(message, okLabel = 'delete', danger = true) {
    if (confirmResolve) return Promise.resolve(false);
    $('confirmMessage').textContent = message;
    $('confirmOk').textContent = tr(okLabel);
    $('confirmOk').classList.toggle('confirm-danger', danger);
    $('confirmOk').classList.toggle('button-primary', !danger);
    $('confirmDialog').hidden = false;
    $('confirmOk').focus();
    return new Promise((resolve) => { confirmResolve = resolve; });
  }
  $('confirmOk').addEventListener('click', () => closeConfirm(true));
  $('confirmCancel').addEventListener('click', () => closeConfirm(false));
  $('confirmDialog').addEventListener('pointerdown', (event) => { if (event.target === event.currentTarget) closeConfirm(false); });

  async function removeSelected() {
    if (selectedLinkId) { removeLink(selectedLinkId); return; }
    const node = getNode(selectedId);
    if (!node) return;
    if (!isFree() && !node.parentId && node.id === rootNode()?.id) { showToast('theMainRootNodeCannot'); return; }
    const question = `${tr('deleteNode')} «${node.text || tr('untitled')}»?`
      + (!isFree() && childrenOf(node.id).length ? ` ${tr('allOfItsChildNodes')}` : '');
    if (!(await confirmDialog(question)) || !getNode(node.id)) return;
    if (isFree()) {
      map.nodes = map.nodes.filter((item) => item.id !== node.id);
      map.links = map.links.filter((link) => link.source !== node.id && link.target !== node.id);
      if (connectionSourceId === node.id) connectionSourceId = null;
      selectedId = map.nodes[0]?.id || null;
      draw(); markDirty(); return;
    }
    const removeIds = new Set([node.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of map.nodes) if (item.parentId && removeIds.has(item.parentId) && !removeIds.has(item.id)) { removeIds.add(item.id); changed = true; }
    }
    map.nodes = map.nodes.filter((item) => !removeIds.has(item.id));
    selectedId = node.parentId || rootNode()?.id || null;
    draw(); markDirty();
  }

  const EDGE_ZONE = 8;
  const edgeAt = (event, el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const ex = event.clientX - r.left < EDGE_ZONE ? -1 : r.right - event.clientX < EDGE_ZONE ? 1 : 0;
    const ey = event.clientY - r.top < EDGE_ZONE ? -1 : r.bottom - event.clientY < EDGE_ZONE ? 1 : 0;
    return ex || ey ? { ex, ey } : null;
  };
  const setResizeCursor = (edge) => {
    els.viewport.classList.remove('resize-ew', 'resize-ns', 'resize-nwse', 'resize-nesw');
    if (!edge) return;
    els.viewport.classList.add(edge.ex && edge.ey ? (edge.ex === edge.ey ? 'resize-nwse' : 'resize-nesw') : edge.ex ? 'resize-ew' : 'resize-ns');
  };
  document.addEventListener('keyup', (event) => { if (event.key === 'Control' && pointerMode?.kind !== 'resize') setResizeCursor(null); });
  window.addEventListener('blur', () => { if (pointerMode?.kind !== 'resize') setResizeCursor(null); });
  function beginNodePointer(event) {
    if (event.button !== 0) return;
    const element = event.target.closest('.node');
    const node = element && getNode(element.dataset.id);
    if (!node) return;
    if (connectionSourceId) {
      event.preventDefault(); event.stopPropagation(); completeConnection(node.id); return;
    }
    // preventDefault ниже не даёт браузеру снять фокус с поля редактора — снимаем сами.
    if (els.editor.contains(document.activeElement)) document.activeElement.blur();
    // Ctrl + край узла: тянем край, меняя дополнительную ширину/высоту (симметрично, центр узла не двигается).
    const edge = event.ctrlKey ? edgeAt(event, element) : null;
    if (edge) {
      event.preventDefault(); event.stopPropagation();
      pointerMode = { kind: 'resize', id: node.id, ex: edge.ex, ey: edge.ey, startX: event.clientX, startY: event.clientY, w0: nodeExtra(node), h0: nodeExtraH(node), moved: false };
      els.viewport.setPointerCapture(event.pointerId);
      setResizeCursor(edge);
      return;
    }
    pointerMode = { kind: 'node', id: node.id, startX: event.clientX, startY: event.clientY, nodeX: node.x, nodeY: node.y, moved: false };
    els.viewport.setPointerCapture(event.pointerId);
    selectNode(node.id);
    event.preventDefault();
  }

  // Два пальца: щипок масштабирует карту и двигает её вместе с центром жеста.
  // Слушатель стоит на фазе перехвата, чтобы второй палец не начал перетаскивать узел.
  const pointers = new Map();
  els.viewport.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return; // у мыши жеста из двух указателей не бывает, а «залипший» указатель сломал бы счёт
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size !== 2) return;
    event.stopPropagation();
    if (pointerMode?.moved) markDirty();
    els.viewport.classList.remove('panning');
    setResizeCursor(null);
    const [a, b] = [...pointers.values()];
    const rect = els.viewport.getBoundingClientRect();
    pointerMode = { kind: 'pinch', dist0: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale0: scale, cx0: (a.x + b.x) / 2 - rect.left, cy0: (a.y + b.y) / 2 - rect.top, panX: pan.x, panY: pan.y };
    els.viewport.setPointerCapture(event.pointerId);
  }, true);
  els.viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('.node')) return;
    pointerMode = { kind: 'pan', startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y };
    els.viewport.classList.add('panning');
    els.viewport.setPointerCapture(event.pointerId);
  });
  els.viewport.addEventListener('pointermove', (event) => {
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointerMode?.kind === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const rect = els.viewport.getBoundingClientRect();
      const next = Math.min(1.8, Math.max(.25, pointerMode.scale0 * Math.hypot(a.x - b.x, a.y - b.y) / pointerMode.dist0));
      const k = next / pointerMode.scale0;
      scale = next;
      pan.x = (a.x + b.x) / 2 - rect.left - (pointerMode.cx0 - pointerMode.panX) * k;
      pan.y = (a.y + b.y) / 2 - rect.top - (pointerMode.cy0 - pointerMode.panY) * k;
      applyView();
      return;
    }
    if (!pointerMode) {
      setResizeCursor(event.ctrlKey ? edgeAt(event, event.target.closest?.('.node')) : null);
      return;
    }
    if (pointerMode.kind === 'resize') {
      const node = getNode(pointerMode.id); if (!node) return;
      const clamp = (value) => Math.max(-200, Math.min(1000, Math.round(value)));
      if (pointerMode.ex) node.extraWidth = clamp(pointerMode.w0 + pointerMode.ex * 2 * (event.clientX - pointerMode.startX) / scale);
      if (pointerMode.ey) node.extraHeight = clamp(pointerMode.h0 + pointerMode.ey * 2 * (event.clientY - pointerMode.startY) / scale);
      pointerMode.moved = true; scheduleDraw();
      return;
    }
    if (pointerMode.kind === 'pan') {
      pan.x = pointerMode.panX + event.clientX - pointerMode.startX;
      pan.y = pointerMode.panY + event.clientY - pointerMode.startY;
      applyView();
      return;
    }
    const dx = (event.clientX - pointerMode.startX) / scale;
    const dy = (event.clientY - pointerMode.startY) / scale;
    if (Math.abs(dx) + Math.abs(dy) > 3) pointerMode.moved = true;
    const node = getNode(pointerMode.id);
    if (node && pointerMode.moved) { node.x = pointerMode.nodeX + dx; node.y = pointerMode.nodeY + dy; scheduleDraw(); }
  });
  const endPointer = (event) => {
    pointers.delete(event.pointerId);
    if (pointerMode?.kind === 'pinch') {
      if (pointers.size < 2) pointerMode = null;
      return;
    }
    if (pointerMode?.kind === 'pan') {
      els.viewport.classList.remove('panning');
      const clicked = event?.type === 'pointerup' && Math.abs(event.clientX - pointerMode.startX) + Math.abs(event.clientY - pointerMode.startY) <= 3;
      if (clicked && !connectionSourceId && (selectedId || selectedLinkId)) {
        selectedId = null; selectedLinkId = null;
        draw();
      }
    }
    if ((pointerMode?.kind === 'node' || pointerMode?.kind === 'resize') && pointerMode.moved) markDirty();
    if (pointerMode?.kind === 'resize') { setResizeCursor(null); if (pointerMode.moved) syncEditor(); }
    pointerMode = null;
  };
  els.viewport.addEventListener('pointerup', endPointer);
  els.viewport.addEventListener('pointercancel', endPointer);
  els.viewport.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    openContextMenu(event, 'canvas');
  });
  els.viewport.addEventListener('dblclick', (event) => {
    if (event.target.closest('.node, [data-link-id]')) return;
    if (!isFree()) { addChild(); return; }
    const rect = els.viewport.getBoundingClientRect();
    addRootAt((event.clientX - rect.left - pan.x) / scale, (event.clientY - rect.top - pan.y) / scale);
  });
  els.viewport.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = els.viewport.getBoundingClientRect();
    setZoom(scale * (event.deltaY < 0 ? 1.09 : 1 / 1.09), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });

  els.nodeText.addEventListener('input', () => { if (suppressEditor) return; const node = getNode(selectedId); if (!node) return; node.text = els.nodeText.value; draw(); markDirty(); });
  els.nodeNotes.addEventListener('input', () => { if (suppressEditor) return; const node = getNode(selectedId); if (!node) return; node.notes = els.nodeNotes.value; draw(); markDirty(); });
  els.nodeColor.addEventListener('input', () => { const node = getNode(selectedId); if (!node) return; node.color = els.nodeColor.value; draw(); markDirty(); });
  els.mapTitle.addEventListener('input', () => { fitTitleWidth(); map.title = els.mapTitle.value; const root = rootNode(); if (!isFree() && root && sameInAnyLanguage(root.text, 'myMindMap')) root.text = map.title; draw(); markDirty(); });

  function startConnection() {
    if (!isFree()) return;
    if (!getNode(selectedId)) { showToast('selectANodeFirst'); return; }
    connectionSourceId = selectedId;
    draw(); showToast('clickASecondNodeEsc');
  }

  function completeConnection(targetId) {
    const source = connectionSourceId;
    if (source === targetId) { showToast('chooseADifferentNode'); return; }
    if (!source || !getNode(source) || !getNode(targetId)) { connectionSourceId = null; draw(); return; }
    const exists = map.links.some((link) => (link.source === source && link.target === targetId) || (link.source === targetId && link.target === source));
    if (!exists) map.links.push({ id: id(), source, target: targetId, direction: 'forward', color: DEFAULT_LINK_COLOR, width: map.settings.linkWidth });
    connectionSourceId = null; selectedId = targetId;
    draw(); if (!exists) markDirty(); showToast(exists ? 'theseNodesAreAlreadyConnected' : 'linkAdded');
  }

  function removeLink(linkId) {
    if (isFree()) map.links = map.links.filter((link) => link.id !== linkId);
    else {
      const link = getLink(linkId);
      if (!link) return;
      const child = getNode(link.target);
      child.parentId = null; delete child.parentLinkColor; delete child.parentLinkWidth;
    }
    if (selectedLinkId === linkId) selectedLinkId = null;
    draw(); markDirty();
  }

  function switchMode(nextMode) {
    if (nextMode === map.mode) return;
    if (nextMode === 'free') {
      map.links = map.nodes.filter((node) => node.parentId).map((node) => ({ id: id(), source: node.parentId, target: node.id, direction: 'forward', color: node.parentLinkColor || DEFAULT_LINK_COLOR, width: node.parentLinkWidth }));
      map.nodes.forEach((node) => { node.parentId = null; delete node.parentLinkColor; delete node.parentLinkWidth; });
    } else {
      const parents = new Map(map.nodes.map((node) => [node.id, null]));
      const linkColors = new Map();
      const linkWidths = new Map();
      for (const link of map.links) {
        if (link.direction === 'both') {
          syncModePicker(); showToast('replaceTwoWayLinksWith'); return;
        }
        const parent = link.direction === 'reverse' ? link.target : link.source;
        const child = link.direction === 'reverse' ? link.source : link.target;
        if (parents.get(child) !== null) {
          syncModePicker(); showToast('inHierarchyModeANode'); return;
        }
        parents.set(child, parent);
        linkColors.set(child, link.color || DEFAULT_LINK_COLOR);
        linkWidths.set(child, link.width);
      }
      for (const node of map.nodes) {
        const visited = new Set();
        let current = node.id;
        while (current !== null) {
          if (visited.has(current)) {
            syncModePicker(); showToast('theLinksContainACycle'); return;
          }
          visited.add(current); current = parents.get(current);
        }
      }
      map.nodes.forEach((node) => { node.parentId = parents.get(node.id); node.parentLinkColor = linkColors.get(node.id); node.parentLinkWidth = linkWidths.get(node.id); });
      map.links = [];
    }
    map.mode = nextMode;
    selectedLinkId = null;
    connectionSourceId = null; els.contextMenu.hidden = true;
    draw(); markDirty();
    showToast(nextMode === 'free' ? 'freeformMapNodesAndLinks' : 'hierarchyCreatedUsingLinkDirections');
  }

  function syncModePicker() {
    $('mapMode').querySelectorAll('input[type="radio"]').forEach((input) => {
      input.checked = input.value === map.mode;
    });
  }

  async function imageToDataUrl(file) {
    if (file.size > 12 * 1024 * 1024) throw new Error('imageMustBeSmallerThan');
    if (!file.type.startsWith('image/')) throw new Error('chooseAnImageFile');
    if (!('createImageBitmap' in window)) return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL('image/webp', .86);
  }

  els.imageInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    const node = getNode(selectedId); if (!node) { showToast('selectANodeFirst'); event.target.value = ''; return; }
    try { node.image = await imageToDataUrl(file); draw(); markDirty(); showToast('imageAddedToNode'); }
    catch (error) { showToast(error.message || 'couldNotOpenTheImage'); }
    event.target.value = '';
  });

  function normalizeImported(data) {
    if (data?.version !== 3 || !['hierarchical', 'free'].includes(data.mode)) throw new Error('aVersion3MapJson');
    if (!data || !Array.isArray(data.nodes)) throw new Error('theFileHasNoMap');
    if (!Array.isArray(data.links)) throw new Error('theFileHasNoLinks');
    const free = data.mode === 'free';
    if (!validWidth(data.settings?.nodeBorderWidth) || !validWidth(data.settings?.linkWidth)) throw new Error('borderAndLinkWidthsIn');
    const seen = new Set();
    const nodes = data.nodes.map((raw) => {
      if (!raw || typeof raw.id !== 'string' || !raw.id || seen.has(raw.id)) throw new Error('theFileContainsInvalidOr');
      seen.add(raw.id);
      if (free && raw.parentId != null) throw new Error('nodesInAFreeformMap');
      if (!free && raw.parentId != null && typeof raw.parentId !== 'string') throw new Error('invalidNodeParentid');
      const parentId = !free && typeof raw.parentId === 'string' ? raw.parentId : null;
      if (!validWidth(raw.borderWidth) || (parentId && !validWidth(raw.parentLinkWidth))) throw new Error('invalidNodeBorderOrLink');
      return { id: raw.id, parentId, borderWidth: raw.borderWidth, parentLinkWidth: parentId ? raw.parentLinkWidth : undefined, parentLinkColor: !free && /^#[0-9a-f]{6}$/i.test(raw.parentLinkColor) ? raw.parentLinkColor : undefined, showLeftStripe: raw.showLeftStripe === false ? false : undefined, showRightStripe: raw.showRightStripe === true ? true : undefined, backgroundColor: validColor(raw.backgroundColor) ? raw.backgroundColor : undefined, titleFontSize: validFontSize(raw.titleFontSize) ? raw.titleFontSize : undefined, notesFontSize: validFontSize(raw.notesFontSize) ? raw.notesFontSize : undefined, titleAlign: ALIGNMENTS.includes(raw.titleAlign) ? raw.titleAlign : undefined, notesAlign: ALIGNMENTS.includes(raw.notesAlign) ? raw.notesAlign : undefined, extraWidth: validExtraWidth(raw.extraWidth) ? raw.extraWidth : undefined, extraHeight: validExtraWidth(raw.extraHeight) ? raw.extraHeight : undefined, text: String(raw.text ?? ''), notes: String(raw.notes ?? ''), color: /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : (free || parentId ? DEFAULT_CHILD_COLOR : DEFAULT_ROOT_COLOR), image: typeof raw.image === 'string' && raw.image.startsWith('data:image/') ? raw.image : '', x: Number.isFinite(raw.x) ? raw.x : 0, y: Number.isFinite(raw.y) ? raw.y : 0 };
    });
    for (const node of nodes) if (node.parentId && !seen.has(node.parentId)) throw new Error(`${tr('nodeParentNotFound')} «${node.text}».`);
    const roots = nodes.filter((node) => !node.parentId);
    if (!free && nodes.length && roots.length < 1) throw new Error('theMapMustHaveAt');
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const node of nodes) {
      let next = node.parentId, hops = 0;
      while (next) { if (next === node.id || ++hops > nodes.length) throw new Error('aCycleWasFoundIn'); next = byId.get(next)?.parentId || null; }
    }
    const linkIds = new Set(), pairs = new Set();
    if (!free && data.links.length) throw new Error('inAHierarchicalMapLinks');
    const links = data.links.map((raw) => {
      if (!raw || typeof raw.id !== 'string' || !raw.id || linkIds.has(raw.id)) throw new Error('invalidOrDuplicateLinkId');
      if (!seen.has(raw.source) || !seen.has(raw.target) || raw.source === raw.target) throw new Error('aLinkMustConnectTwo');
      const pair = JSON.stringify([raw.source, raw.target].sort());
      if (pairs.has(pair)) throw new Error('aLinkBetweenTheseNodes');
      linkIds.add(raw.id); pairs.add(pair);
      const direction = raw.direction ?? 'forward';
      if (!['forward', 'reverse', 'both'].includes(direction)) throw new Error('unknownLinkDirection');
      const color = /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : DEFAULT_LINK_COLOR;
      if (!validWidth(raw.width)) throw new Error('invalidLinkWidthMustBe');
      return { id: raw.id, source: raw.source, target: raw.target, direction, color, width: raw.width };
    });
    return { version: 3, language: ['en', 'uk', 'ru'].includes(data.language) ? data.language : 'en', mode: data.mode, title: String(data.title || roots[0]?.text || 'My Mind Map'), settings: { backgroundStyle: BACKGROUND_STYLES.includes(data.settings.backgroundStyle) ? data.settings.backgroundStyle : 'wash', nodeExtraWidth: validExtraWidth(data.settings.nodeExtraWidth) ? data.settings.nodeExtraWidth : 0, nodeExtraHeight: validExtraWidth(data.settings.nodeExtraHeight) ? data.settings.nodeExtraHeight : 0, nodeBackgroundColor: validColor(data.settings.nodeBackgroundColor) ? data.settings.nodeBackgroundColor : DEFAULT_NODE_BACKGROUND_COLOR, titleFontSize: validFontSize(data.settings.titleFontSize) ? data.settings.titleFontSize : DEFAULT_TITLE_FONT_SIZE, notesFontSize: validFontSize(data.settings.notesFontSize) ? data.settings.notesFontSize : DEFAULT_NOTES_FONT_SIZE, backgroundColor: /^#[0-9a-f]{6}$/i.test(data.settings.backgroundColor) ? data.settings.backgroundColor : DEFAULT_BACKGROUND_COLOR, nodeBorderWidth: data.settings.nodeBorderWidth, linkWidth: data.settings.linkWidth, titleAlign: ALIGNMENTS.includes(data.settings.titleAlign) ? data.settings.titleAlign : DEFAULT_TITLE_ALIGN, notesAlign: ALIGNMENTS.includes(data.settings.notesAlign) ? data.settings.notesAlign : DEFAULT_NOTES_ALIGN }, nodes, links };
  }

  async function openJson(file) {
    if (unsaved && !(await confirmDialog(tr('openTheFileUnsavedChanges'), 'open', false))) return;
    try {
      if (file.size > 80 * 1024 * 1024) throw new Error('theMapFileIsLarger');
      const imported = normalizeImported(JSON.parse(await file.text()));
      map = imported; language = imported.language; applyLanguage(); selectedId = rootNode()?.id || null; selectedLinkId = null; fileHandle = null; connectionSourceId = null;
      draw(); fitMap(); markDirty(); setFileStatus('saved'); showToast('mapOpened');
    } catch (error) { showToast(error.message || 'couldNotReadTheJson'); }
  }

  async function saveJson() {
    const savedVersion = changeVersion;
    const content = JSON.stringify({ version: 3, language, mode: map.mode, title: map.title, updatedAt: new Date().toISOString(), settings: { ...map.settings }, links: map.links, nodes: map.nodes.map(({ id, parentId, parentLinkColor, parentLinkWidth, borderWidth, showLeftStripe, showRightStripe, backgroundColor, titleFontSize, notesFontSize, titleAlign, notesAlign, extraWidth, extraHeight, text, notes, color, image, x, y }) => ({ id, borderWidth, showLeftStripe, showRightStripe, backgroundColor, titleFontSize, notesFontSize, titleAlign, notesAlign, extraWidth, extraHeight, ...(isFree() ? {} : { parentId, parentLinkColor, parentLinkWidth }), text, notes, color, image, x: Math.round(x), y: Math.round(y) })) }, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const filename = `${(map.title || 'mindmap').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'mindmap'}.json`;
    try {
      if (fileHandle && 'createWritable' in fileHandle) {
        const writable = await fileHandle.createWritable(); await writable.write(blob); await writable.close();
      } else if ('showSaveFilePicker' in window) {
        fileHandle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: 'Mind map JSON', accept: { 'application/json': ['.json'] } }] });
        const writable = await fileHandle.createWritable(); await writable.write(blob); await writable.close();
      } else {
        const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      if (changeVersion === savedVersion) setFileStatus('saved');
      showToast('mapSavedAsJson');
    } catch (error) {
      if (error.name === 'AbortError') return;
      showToast(`${tr('couldNotSaveFile')}${error.message || tr('accessError')}`);
    }
  }

  $('addChildButton').addEventListener('click', addChild);
  $('mapMode').addEventListener('change', (event) => {
    if (event.target.matches('input[type="radio"]') && event.target.checked) switchMode(event.target.value);
  });
  $('connectNodeButton').addEventListener('click', startConnection);
  $('linkDirection').addEventListener('change', (event) => {
    const link = map.links.find((item) => item.id === selectedLinkId);
    if (!isFree() || !link || !event.target.matches('input[type="radio"]') || !event.target.checked) return;
    link.direction = event.target.value;
    draw(); markDirty();
  });
  $('deleteLinkButton').addEventListener('click', () => { if (selectedLinkId) removeLink(selectedLinkId); });
  $('linkColor').addEventListener('input', (event) => {
    updateLink('color', event.target.value);
  });
  const bindWidth = (inputId, update, valid = validWidth) => {
    const input = $(inputId);
    input.addEventListener('input', () => {
      const width = input.valueAsNumber;
      if (input.validity.valid && valid(width)) update(width);
    });
    input.addEventListener('blur', () => syncEditor());
  };
  for (const [key, nodeInputId, allInputId] of [['titleFontSize', 'nodeTitleFontSize', 'allTitleFontSize'], ['notesFontSize', 'nodeNotesFontSize', 'allNotesFontSize']]) {
    bindWidth(nodeInputId, (size) => {
      const node = getNode(selectedId); if (!node) return;
      node[key] = size; draw(); markDirty();
    }, validFontSize);
    bindWidth(allInputId, (size) => {
      map.settings[key] = size;
      map.nodes.forEach((node) => { delete node[key]; });
      draw(); markDirty();
    }, validFontSize);
  }
  const setNodeBackground = (color) => {
    const node = getNode(selectedId); if (!node) return;
    if (color) node.backgroundColor = color; else delete node.backgroundColor;
    draw(); markDirty();
  };
  $('nodeBackgroundColor').addEventListener('input', (event) => setNodeBackground(event.target.value));
  $('resetNodeBackgroundColor').addEventListener('click', () => setNodeBackground(null));
  // В узле хранится только отличие от значения по умолчанию: левая полоска включена, правая выключена.
  for (const [inputId, key, byDefault] of [['nodeShowLeftStripe', 'showLeftStripe', true], ['nodeShowRightStripe', 'showRightStripe', false]]) {
    $(inputId).addEventListener('change', (event) => {
      const node = getNode(selectedId); if (!node) return;
      if (event.target.checked === byDefault) delete node[key]; else node[key] = event.target.checked;
      draw(); markDirty();
    });
  }
  const setAllNodeBackground = (color) => {
    map.settings.nodeBackgroundColor = color;
    map.nodes.forEach((node) => { if (!isRootNode(node)) delete node.backgroundColor; });
    draw(); markDirty();
  };
  $('allNodeBackgroundColor').addEventListener('input', (event) => setAllNodeBackground(event.target.value));
  $('resetAllNodeBackgroundColor').addEventListener('click', () => setAllNodeBackground(DEFAULT_NODE_BACKGROUND_COLOR));
  bindWidth('nodeBorderWidth', (width) => {
    const node = getNode(selectedId); if (!node) return;
    node.borderWidth = width; draw(); markDirty();
  });
  bindWidth('nodeExtraWidth', (width) => {
    map.settings.nodeExtraWidth = width;
    map.nodes.forEach((node) => { delete node.extraWidth; });
    draw(); markDirty();
  }, validExtraWidth);
  bindWidth('nodeExtraHeight', (height) => {
    map.settings.nodeExtraHeight = height;
    map.nodes.forEach((node) => { delete node.extraHeight; });
    draw(); markDirty();
  }, validExtraWidth);
  bindWidth('nodeExtraHeightOwn', (height) => {
    const node = getNode(selectedId); if (!node) return;
    node.extraHeight = height; draw(); markDirty();
  }, validExtraWidth);
  bindWidth('nodeExtraWidthOwn', (width) => {
    const node = getNode(selectedId); if (!node) return;
    node.extraWidth = width; draw(); markDirty();
  }, validExtraWidth);
  bindWidth('linkWidth', (width) => updateLink('width', width));
  bindWidth('allNodeBorderWidth', (width) => {
    map.settings.nodeBorderWidth = width;
    map.nodes.forEach((node) => { node.borderWidth = width; });
    draw(); markDirty();
  });
  bindWidth('allLinkWidth', (width) => {
    map.settings.linkWidth = width;
    if (isFree()) map.links.forEach((link) => { link.width = width; });
    else map.nodes.forEach((node) => { if (node.parentId) node.parentLinkWidth = width; });
    draw(); markDirty();
  });
  for (const key of ['titleAlign', 'notesAlign']) {
    $(key).addEventListener('change', (event) => {
      if (!event.target.matches('input[type="radio"]') || !event.target.checked || !ALIGNMENTS.includes(event.target.value)) return;
      map.settings[key] = event.target.value;
      // Как и толщина, общее выравнивание применяется ко всей карте и сбрасывает значения отдельных узлов.
      map.nodes.forEach((node) => { delete node[key]; });
      draw(); markDirty();
    });
  }
  for (const [pickerId, key] of [['nodeTitleAlign', 'titleAlign'], ['nodeNotesAlign', 'notesAlign']]) {
    $(pickerId).addEventListener('change', (event) => {
      const node = getNode(selectedId);
      if (!node || !event.target.matches('input[type="radio"]') || !event.target.checked || !ALIGNMENTS.includes(event.target.value)) return;
      node[key] = event.target.value;
      draw(); markDirty();
    });
  }
  $('addSiblingButton').addEventListener('click', addSibling);
  $('deleteButton').addEventListener('click', removeSelected);
  $('layoutButton').addEventListener('click', layoutTree);
  $('fitButton').addEventListener('click', fitMap);
  $('zoomIn').addEventListener('click', () => setZoom(scale * 1.12));
  $('zoomOut').addEventListener('click', () => setZoom(scale / 1.12));
  $('saveButton').addEventListener('click', saveJson);
  $('languagePicker').addEventListener('change', (event) => {
    language = ['en', 'uk', 'ru'].includes(event.target.value) ? event.target.value : 'en';
    map.language = language;
    applyLanguage();
    draw();
    syncEditor();
    markDirty();
  });
  $('openButton').addEventListener('click', () => $('jsonInput').click());
  $('jsonInput').addEventListener('change', (event) => { const file = event.target.files?.[0]; if (file) openJson(file); event.target.value = ''; });
  $('newButton').addEventListener('click', async () => {
    if (!(await confirmDialog(tr('createANewMapSave'), 'create', false))) return;
    createStarter(map.mode); fileHandle = null; draw(); fitMap(); markDirty(); showToast('newMapCreated');
  });
  $('settingsButton').addEventListener('click', () => {
    settingsOpen = !settingsOpen;
    if (settingsOpen && window.matchMedia('(max-width: 760px)').matches) els.editor.classList.add('open');
    syncEditor();
  });
  $('closeEditor').addEventListener('click', () => {
    if (settingsOpen) {
      settingsOpen = false;
      els.editor.classList.remove('settings-mode');
      if (window.matchMedia('(max-width: 760px)').matches) els.editor.classList.remove('open');
      syncEditor();
    } else els.editor.classList.remove('open');
  });
  const setBackgroundColor = (color) => { map.settings.backgroundColor = color; draw(); markDirty(); };
  $('backgroundStyle').addEventListener('change', (event) => {
    if (!BACKGROUND_STYLES.includes(event.target.value)) return;
    map.settings.backgroundStyle = event.target.value; draw(); markDirty();
  });
  $('backgroundColor').addEventListener('input', (event) => setBackgroundColor(event.target.value));
  $('resetBackgroundColor').addEventListener('click', () => setBackgroundColor(DEFAULT_BACKGROUND_COLOR));
  $('contextAddRootButton').addEventListener('click', () => {
    const x = Number(els.contextMenu.dataset.mapX);
    const y = Number(els.contextMenu.dataset.mapY);
    els.contextMenu.hidden = true;
    addRootAt(Number.isFinite(x) ? x : 80, Number.isFinite(y) ? y : 60);
  });
  $('contextAddChildButton').addEventListener('click', () => {
    els.contextMenu.hidden = true;
    if (isFree()) addLinkedChild(); else addChild();
  });
  $('contextDeleteButton').addEventListener('click', () => {
    els.contextMenu.hidden = true;
    removeSelected();
  });
  $('contextConnectButton').addEventListener('click', () => { els.contextMenu.hidden = true; startConnection(); });
  $('contextDeleteLinkButton').addEventListener('click', () => { const linkId = els.contextMenu.dataset.linkId; els.contextMenu.hidden = true; removeLink(linkId); });
  document.addEventListener('pointerdown', (event) => {
    if (!els.contextMenu.hidden && !els.contextMenu.contains(event.target)) els.contextMenu.hidden = true;
  });
  // Поиск: ввод находит все совпадения и переходит к первому, Enter / Shift+Enter листают их по кругу.
  // Счётчик «2/5» показывается на месте подсказки ⌘K, пока в поле есть запрос.
  const searchInput = $('searchInput');
  const searchBadge = searchInput.parentElement.querySelector('kbd');
  const searchBadgeDefault = searchBadge.textContent;
  let searchMatches = [], searchIndex = 0;
  function resetSearch() {
    searchMatches = []; searchIndex = 0;
    searchBadge.textContent = searchBadgeDefault;
  }
  function goToMatch(index) {
    searchMatches = searchMatches.filter((node) => getNode(node.id));
    if (!searchMatches.length) { searchBadge.textContent = '0'; return; }
    searchIndex = (index + searchMatches.length) % searchMatches.length;
    const found = searchMatches[searchIndex];
    selectNode(found.id);
    const element = nodeEls.get(found.id);
    const rect = els.viewport.getBoundingClientRect();
    pan.x = rect.width / 2 - (nodeLeft(found) + (element?.offsetWidth ?? 220) / 2) * scale;
    pan.y = rect.height / 2 - (nodeTop(found) + (element?.offsetHeight ?? 70) / 2) * scale;
    applyView();
    searchBadge.textContent = `${searchIndex + 1}/${searchMatches.length}`;
    requestAnimationFrame(() => nodeEls.get(found.id)?.classList.add('flash'));
  }
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLocaleLowerCase();
    if (!query) { resetSearch(); return; }
    searchMatches = map.nodes.filter((node) => `${node.text} ${node.notes}`.toLocaleLowerCase().includes(query));
    goToMatch(0);
  });
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); if (searchMatches.length) goToMatch(searchIndex + (event.shiftKey ? -1 : 1)); }
    else if (event.key === 'Escape') { event.stopPropagation(); searchInput.value = ''; resetSearch(); searchInput.blur(); }
  });

  document.addEventListener('keydown', (event) => {
    if (confirmResolve) {
      if (event.key === 'Escape') { event.preventDefault(); closeConfirm(false); }
      else if (event.key === 'Tab') { event.preventDefault(); (document.activeElement === $('confirmOk') ? $('confirmCancel') : $('confirmOk')).focus(); }
      else if (event.key !== 'Enter' && event.key !== ' ') event.preventDefault();
      return;
    }
    if (view3d.active) { event.preventDefault(); exit3d(); return; }
    const typing = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
    if (!els.contextMenu.hidden && (event.key === 'Enter' || event.key === ' ')) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveJson(); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('searchInput').focus(); $('searchInput').select(); }
    else if (event.key === 'F2' && !typing && getNode(selectedId)) { event.preventDefault(); els.editor.classList.add('open'); els.nodeText.focus(); els.nodeText.select(); }
    else if (event.key === 'Enter' && !typing) { event.preventDefault(); addChild(); }
    else if ((event.key === 'Delete' || event.key === 'Backspace') && !typing) { event.preventDefault(); removeSelected(); }
    else if (event.key === 'Escape') {
      const needsRedraw = !!connectionSourceId || settingsOpen;
      connectionSourceId = null; settingsOpen = false;
      els.editor.classList.remove('open'); els.contextMenu.hidden = true;
      if (needsRedraw) draw();
    }
  });
  window.addEventListener('beforeunload', (event) => {
    if (!unsaved) return;
    event.preventDefault();
    event.returnValue = '';
  });
  els.board.addEventListener('dragover', (event) => { event.preventDefault(); });
  els.board.addEventListener('drop', (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file?.name.toLowerCase().endsWith('.json')) openJson(file);
    else if (file?.type.startsWith('image/')) { const target = getNode(selectedId); if (!target) return showToast('selectANodeFirst'); imageToDataUrl(file).then((src) => { target.image = src; draw(); markDirty(); }).catch((error) => showToast(error.message)); }
  });

  applyLanguage();
  createStarter();
  draw();
  unsaved = false; // нетронутая стартовая карта не требует предупреждения при закрытии вкладки
  requestAnimationFrame(() => { fitMap(); if (!selectedId) selectNode(rootNode()?.id); });
})();

