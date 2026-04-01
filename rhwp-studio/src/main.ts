import { WasmBridge } from '@/core/wasm-bridge';
import type { DocumentInfo } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { CanvasView } from '@/view/canvas-view';
import { InputHandler } from '@/engine/input-handler';
import { Toolbar } from '@/ui/toolbar';
import { MenuBar } from '@/ui/menu-bar';
import { loadWebFonts } from '@/core/font-loader';
import { CommandRegistry } from '@/command/registry';
import { CommandDispatcher } from '@/command/dispatcher';
import type { EditorContext, CommandServices } from '@/command/types';
import { fileCommands } from '@/command/commands/file';
import { editCommands } from '@/command/commands/edit';
import { viewCommands } from '@/command/commands/view';
import { formatCommands } from '@/command/commands/format';
import { insertCommands } from '@/command/commands/insert';
import { tableCommands } from '@/command/commands/table';
import { pageCommands } from '@/command/commands/page';
import { toolCommands } from '@/command/commands/tool';
import { ContextMenu } from '@/ui/context-menu';
import { CellSelectionRenderer } from '@/engine/cell-selection-renderer';
import { TableObjectRenderer } from '@/engine/table-object-renderer';
import { TableResizeRenderer } from '@/engine/table-resize-renderer';
import { Ruler } from '@/view/ruler';

const wasm = new WasmBridge();
const eventBus = new EventBus();

// E2E 테스트용 전역 노출 (개발 모드 전용)
if (import.meta.env.DEV) {
  (window as any).__wasm = wasm;
  (window as any).__eventBus = eventBus;
}
let canvasView: CanvasView | null = null;
let inputHandler: InputHandler | null = null;
let toolbar: Toolbar | null = null;
let ruler: Ruler | null = null;


// ─── 커맨드 시스템 ─────────────────────────────
const registry = new CommandRegistry();

function getContext(): EditorContext {
  return {
    hasDocument: wasm.pageCount > 0,
    hasSelection: inputHandler?.hasSelection() ?? false,
    inTable: inputHandler?.isInTable() ?? false,
    inCellSelectionMode: inputHandler?.isInCellSelectionMode() ?? false,
    inTableObjectSelection: inputHandler?.isInTableObjectSelection() ?? false,
    inPictureObjectSelection: inputHandler?.isInPictureObjectSelection() ?? false,
    inField: inputHandler?.isInField() ?? false,
    isEditable: true,
    canUndo: inputHandler?.canUndo() ?? false,
    canRedo: inputHandler?.canRedo() ?? false,
    zoom: canvasView?.getViewportManager().getZoom() ?? 1.0,
    showControlCodes: wasm.getShowControlCodes(),
  };
}

const commandServices: CommandServices = {
  eventBus,
  wasm,
  getContext,
  getInputHandler: () => inputHandler,
  getViewportManager: () => canvasView?.getViewportManager() ?? null,
};

const dispatcher = new CommandDispatcher(registry, commandServices, eventBus);

// 모든 내장 커맨드 등록
registry.registerAll(fileCommands);
registry.registerAll(editCommands);
registry.registerAll(viewCommands);
registry.registerAll(formatCommands);
registry.registerAll(insertCommands);
registry.registerAll(tableCommands);
registry.registerAll(pageCommands);
registry.registerAll(toolCommands);

// 상태 바 요소
const sbMessage = () => document.getElementById('sb-message')!;
const sbPage = () => document.getElementById('sb-page')!;
const sbSection = () => document.getElementById('sb-section')!;
const sbZoomVal = () => document.getElementById('sb-zoom-val')!;

async function initialize(): Promise<void> {
  const msg = sbMessage();
  try {
    msg.textContent = '웹폰트 로딩 중...';
    await loadWebFonts([]);  // CSS @font-face 등록 + CRITICAL 폰트만 로드
    msg.textContent = 'WASM 로딩 중...';
    await wasm.initialize();
    msg.textContent = 'HWP 파일을 선택해주세요.';

    const container = document.getElementById('scroll-container')!;
    canvasView = new CanvasView(container, wasm, eventBus);

    // 눈금자 초기화
    ruler = new Ruler(
      document.getElementById('h-ruler') as HTMLCanvasElement,
      document.getElementById('v-ruler') as HTMLCanvasElement,
      container,
      eventBus,
      wasm,
      canvasView.getVirtualScroll(),
      canvasView.getViewportManager(),
    );

    inputHandler = new InputHandler(
      container, wasm, eventBus,
      canvasView.getVirtualScroll(),
      canvasView.getViewportManager(),
    );

    toolbar = new Toolbar(document.getElementById('style-bar')!, wasm, eventBus, dispatcher);
    toolbar.setEnabled(false);

    // InputHandler에 커맨드 디스패처 및 컨텍스트 메뉴 주입
    inputHandler.setDispatcher(dispatcher);
    inputHandler.setContextMenu(new ContextMenu(dispatcher, registry));
    inputHandler.setCellSelectionRenderer(
      new CellSelectionRenderer(container, canvasView.getVirtualScroll()),
    );
    inputHandler.setTableObjectRenderer(
      new TableObjectRenderer(container, canvasView.getVirtualScroll()),
    );
    inputHandler.setTableResizeRenderer(
      new TableResizeRenderer(container, canvasView.getVirtualScroll()),
    );
    inputHandler.setPictureObjectRenderer(
      new TableObjectRenderer(container, canvasView.getVirtualScroll(), true),
    );

    new MenuBar(document.getElementById('menu-bar')!, eventBus, dispatcher);

    // 툴바 내 data-cmd 버튼 클릭 → 커맨드 디스패치
    document.querySelectorAll('.tb-btn[data-cmd]').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const cmd = (btn as HTMLElement).dataset.cmd;
        if (cmd) dispatcher.dispatch(cmd, { anchorEl: btn as HTMLElement });
      });
    });

    // 스플릿 버튼 드롭다운 메뉴
    document.querySelectorAll('.tb-split').forEach(split => {
      const arrow = split.querySelector('.tb-split-arrow');
      if (arrow) {
        arrow.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          // 다른 열린 메뉴 닫기
          document.querySelectorAll('.tb-split.open').forEach(s => {
            if (s !== split) s.classList.remove('open');
          });
          split.classList.toggle('open');
        });
      }
      split.querySelectorAll('.tb-split-item[data-cmd]').forEach(item => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          split.classList.remove('open');
          const cmd = (item as HTMLElement).dataset.cmd;
          if (cmd) dispatcher.dispatch(cmd, { anchorEl: item as HTMLElement });
        });
      });
    });
    // 외부 클릭 시 스플릿 메뉴 닫기
    document.addEventListener('mousedown', () => {
      document.querySelectorAll('.tb-split.open').forEach(s => s.classList.remove('open'));
    });

    setupFileInput();
    setupZoomControls();
    setupEventListeners();

    // E2E 테스트용 전역 노출 (개발 모드 전용)
    if (import.meta.env.DEV) {
      (window as any).__inputHandler = inputHandler;
      (window as any).__canvasView = canvasView;
    }
  } catch (error) {
    msg.textContent = `WASM 초기화 실패: ${error}`;
    console.error('[main] WASM 초기화 실패:', error);
  }
}

function setupFileInput(): void {
  const fileInput = document.getElementById('file-input') as HTMLInputElement;

  fileInput.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith('.hwp') && !name.endsWith('.hwpx')) {
      alert('HWP/HWPX 파일만 지원합니다.');
      return;
    }
    await loadFile(file);
  });

  // 드래그 앤 드롭 지원
  const container = document.getElementById('scroll-container')!;
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    container.classList.add('drag-over');
  });
  container.addEventListener('dragleave', () => {
    container.classList.remove('drag-over');
  });
  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    container.classList.remove('drag-over');
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    const dropName = file.name.toLowerCase();
    if (!dropName.endsWith('.hwp') && !dropName.endsWith('.hwpx')) {
      alert('HWP/HWPX 파일만 지원합니다.');
      return;
    }
    await loadFile(file);
  });
}

function setupZoomControls(): void {
  if (!canvasView) return;
  const vm = canvasView.getViewportManager();

  document.getElementById('sb-zoom-in')!.addEventListener('click', () => {
    vm.setZoom(vm.getZoom() + 0.1);
  });
  document.getElementById('sb-zoom-out')!.addEventListener('click', () => {
    vm.setZoom(vm.getZoom() - 0.1);
  });

  // 폭 맞춤: 용지 폭에 맞게 줌 조절
  document.getElementById('sb-zoom-fit-width')!.addEventListener('click', () => {
    if (wasm.pageCount === 0) return;
    const container = document.getElementById('scroll-container')!;
    const containerWidth = container.clientWidth - 40; // 좌우 여백 제외
    const pageInfo = wasm.getPageInfo(0);
    // pageInfo.width는 이미 px 단위 (96dpi 기준)
    const zoom = containerWidth / pageInfo.width;
    console.log(`[zoom-fit-width] container=${containerWidth} page=${pageInfo.width} zoom=${zoom.toFixed(3)}`);
    vm.setZoom(Math.max(0.1, Math.min(zoom, 4.0)));
  });

  // 쪽 맞춤: 한 페이지 전체가 보이도록 줌 조절
  document.getElementById('sb-zoom-fit')!.addEventListener('click', () => {
    if (wasm.pageCount === 0) return;
    const container = document.getElementById('scroll-container')!;
    const containerWidth = container.clientWidth - 40;
    const containerHeight = container.clientHeight - 40;
    const pageInfo = wasm.getPageInfo(0);
    // pageInfo.width/height는 이미 px 단위 (96dpi 기준)
    const zoomW = containerWidth / pageInfo.width;
    const zoomH = containerHeight / pageInfo.height;
    console.log(`[zoom-fit-page] containerW=${containerWidth} containerH=${containerHeight} pageW=${pageInfo.width} pageH=${pageInfo.height} zoomW=${zoomW.toFixed(3)} zoomH=${zoomH.toFixed(3)}`);
    vm.setZoom(Math.max(0.1, Math.min(zoomW, zoomH, 4.0)));
  });

  // 모바일: 줌 값 클릭 → 100% 토글
  document.getElementById('sb-zoom-val')!.addEventListener('click', () => {
    const currentZoom = vm.getZoom();
    if (Math.abs(currentZoom - 1.0) < 0.05) {
      // 현재 100% → 쪽 맞춤으로 전환
      document.getElementById('sb-zoom-fit')!.click();
    } else {
      // 현재 쪽 맞춤/기타 → 100%로 전환
      vm.setZoom(1.0);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    if (e.key === '=' || e.key === '+') {
      e.preventDefault();
      vm.setZoom(vm.getZoom() + 0.1);
    } else if (e.key === '-') {
      e.preventDefault();
      vm.setZoom(vm.getZoom() - 0.1);
    } else if (e.key === '0') {
      e.preventDefault();
      vm.setZoom(1.0);
    }
  });
}

let totalSections = 1;

function setupEventListeners(): void {
  eventBus.on('current-page-changed', (page, _total) => {
    const pageIdx = page as number;
    sbPage().textContent = `${pageIdx + 1} / ${_total} 쪽`;

    // 구역 정보: 현재 페이지의 sectionIndex로 갱신
    if (wasm.pageCount > 0) {
      try {
        const pageInfo = wasm.getPageInfo(pageIdx);
        sbSection().textContent = `구역: ${pageInfo.sectionIndex + 1} / ${totalSections}`;
      } catch { /* 무시 */ }
    }
  });

  eventBus.on('zoom-level-display', (zoom) => {
    sbZoomVal().textContent = `${Math.round((zoom as number) * 100)}%`;
  });

  // 삽입/수정 모드 토글
  eventBus.on('insert-mode-changed', (insertMode) => {
    document.getElementById('sb-mode')!.textContent = (insertMode as boolean) ? '삽입' : '수정';
  });

  // 필드 정보 표시
  const sbField = document.getElementById('sb-field');
  eventBus.on('field-info-changed', (info) => {
    if (!sbField) return;
    const fi = info as { fieldId: number; fieldType: string; guideName?: string } | null;
    if (fi) {
      const label = fi.guideName || `#${fi.fieldId}`;
      sbField.textContent = `[누름틀] ${label}`;
      sbField.style.display = '';
    } else {
      sbField.textContent = '';
      sbField.style.display = 'none';
    }
  });

  // 개체 선택 시 회전/대칭 버튼 그룹 표시/숨김
  const rotateGroup = document.querySelector('.tb-rotate-group') as HTMLElement | null;
  if (rotateGroup) {
    eventBus.on('picture-object-selection-changed', (selected) => {
      rotateGroup.style.display = (selected as boolean) ? '' : 'none';
    });
  }

  // 머리말/꼬리말 편집 모드 시 도구상자 전환 + 본문 dimming
  const hfGroup = document.querySelector('.tb-headerfooter-group') as HTMLElement | null;
  const hfLabel = hfGroup?.querySelector('.tb-hf-label') as HTMLElement | null;
  const defaultTbGroups = document.querySelectorAll('#icon-toolbar > .tb-group:not(.tb-headerfooter-group):not(.tb-rotate-group), #icon-toolbar > .tb-sep');
  const scrollContainer = document.getElementById('scroll-container');
  const styleBar = document.getElementById('style-bar');

  eventBus.on('headerFooterModeChanged', (mode) => {
    const isActive = (mode as string) !== 'none';
    // 도구상자 전환
    if (hfGroup) {
      hfGroup.style.display = isActive ? '' : 'none';
    }
    if (hfLabel) {
      hfLabel.textContent = (mode as string) === 'header' ? '머리말' : (mode as string) === 'footer' ? '꼬리말' : '';
    }
    defaultTbGroups.forEach((el) => {
      (el as HTMLElement).style.display = isActive ? 'none' : '';
    });
    // 서식 도구 모음은 머리말/꼬리말 편집 시에도 유지 (문단/글자 모양 설정 필요)
    // 본문 dimming
    if (scrollContainer) {
      if (isActive) {
        scrollContainer.classList.add('hf-editing');
      } else {
        scrollContainer.classList.remove('hf-editing');
      }
    }
  });
}

/** 문서 초기화 공통 시퀀스 (loadFile, createNewDocument 양쪽에서 사용) */
async function initializeDocument(docInfo: DocumentInfo, displayName: string): Promise<void> {
  const msg = sbMessage();
  try {
    console.log('[initDoc] 1. 폰트 로딩 시작');
    if (docInfo.fontsUsed?.length) {
      await loadWebFonts(docInfo.fontsUsed, (loaded, total) => {
        msg.textContent = `폰트 로딩 중... (${loaded}/${total})`;
      });
    }
    console.log('[initDoc] 2. 폰트 로딩 완료');
    msg.textContent = displayName;
    totalSections = docInfo.sectionCount ?? 1;
    sbSection().textContent = `구역: 1 / ${totalSections}`;
    console.log('[initDoc] 3. inputHandler deactivate');
    inputHandler?.deactivate();
    console.log('[initDoc] 4. canvasView loadDocument');
    canvasView?.loadDocument();
    console.log('[initDoc] 5. toolbar setEnabled');
    toolbar?.setEnabled(true);
    console.log('[initDoc] 6. toolbar initStyleDropdown');
    toolbar?.initStyleDropdown();
    console.log('[initDoc] 7. inputHandler activateWithCaretPosition');
    inputHandler?.activateWithCaretPosition();
    console.log('[initDoc] 8. 완료');
  } catch (error) {
    console.error('[initDoc] 오류:', error);
    if (window.innerWidth < 768) alert(`초기화 오류: ${error}`);
  }
}

async function loadFile(file: File): Promise<void> {
  const msg = sbMessage();
  try {
    msg.textContent = '파일 로딩 중...';
    const startTime = performance.now();
    const data = new Uint8Array(await file.arrayBuffer());
    const docInfo = wasm.loadDocument(data, file.name);
    const elapsed = performance.now() - startTime;
    await initializeDocument(docInfo, `${file.name} — ${docInfo.pageCount}페이지 (${elapsed.toFixed(1)}ms)`);
  } catch (error) {
    const errMsg = `파일 로드 실패: ${error}`;
    msg.textContent = errMsg;
    console.error('[main] 파일 로드 실패:', error);
    // 모바일에서 상태 메시지가 숨겨질 수 있으므로 alert으로도 표시
    if (window.innerWidth < 768) alert(errMsg);
  }
}

async function createNewDocument(): Promise<void> {
  const msg = sbMessage();
  try {
    msg.textContent = '새 문서 생성 중...';
    const docInfo = wasm.createNewDocument();
    await initializeDocument(docInfo, `새 문서.hwp — ${docInfo.pageCount}페이지`);
  } catch (error) {
    msg.textContent = `새 문서 생성 실패: ${error}`;
    console.error('[main] 새 문서 생성 실패:', error);
  }
}

// 커맨드에서 새 문서 생성 호출
eventBus.on('create-new-document', () => { createNewDocument(); });

// 수식 더블클릭 → 수식 편집 대화상자
eventBus.on('equation-edit-request', () => {
  dispatcher.dispatch('insert:equation-edit');
});

initialize();

// ── hwpctl-test iframe 연동 ──
// 부모 페이지(hwpctl-test.html)에서 postMessage로 HWP 바이트를 받아 로드
window.addEventListener('message', async (e) => {
  if (e.data?.type === 'hwpctl-load' && e.data.data) {
    try {
      // ArrayBuffer 또는 Array로 수신
      const bytes = e.data.data instanceof ArrayBuffer
        ? new Uint8Array(e.data.data)
        : new Uint8Array(e.data.data);
      // WasmBridge를 통해 로드 (iframe 내부 WASM 인스턴스 사용)
      const docInfo = wasm.loadDocument(bytes, 'hwpctl-test.hwp');
      await initializeDocument(docInfo, `hwpctl — ${docInfo.pageCount}페이지`);
    } catch (err) {
      console.error('[hwpctl-iframe] 문서 로드 실패:', err);
    }
  }
});
