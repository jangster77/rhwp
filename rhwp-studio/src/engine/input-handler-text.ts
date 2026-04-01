/** input-handler text methods — extracted from InputHandler class */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { InsertTextCommand, DeleteTextCommand, MergeParagraphCommand, MergeNextParagraphCommand, MergeParagraphInCellCommand, MergeNextParagraphInCellCommand } from './command';
import type { DocumentPosition } from '@/core/types';

/** IME 조합 종료 후 대기 중인 탐색 키를 처리한다 */
function processPendingNav(this: any, nav: { code: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): void {
  const { code, shiftKey } = nav;

  // 방향키 처리
  if (code === 'ArrowLeft' || code === 'ArrowRight' ||
      code === 'ArrowUp' || code === 'ArrowDown') {
    const vertical = this.cursor.isInVerticalCell?.() ?? false;
    if (shiftKey) {
      this.cursor.setAnchor();
    } else {
      this.cursor.clearSelection();
    }
    let moveH: number | null = null;
    let moveV: number | null = null;
    if (code === 'ArrowLeft') {
      if (vertical) moveV = -1; else moveH = -1;
    } else if (code === 'ArrowRight') {
      if (vertical) moveV = 1; else moveH = 1;
    } else if (code === 'ArrowUp') {
      if (vertical) moveH = -1; else moveV = -1;
    } else {
      if (vertical) moveH = 1; else moveV = 1;
    }
    if (moveH !== null) this.cursor.moveHorizontal(moveH);
    if (moveV !== null) this.cursor.moveVertical(moveV);
    this.updateCaret();
  } else if (code === 'Home') {
    if (shiftKey) this.cursor.setAnchor(); else this.cursor.clearSelection();
    this.cursor.moveToLineStart();
    this.updateCaret();
  } else if (code === 'End') {
    if (shiftKey) this.cursor.setAnchor(); else this.cursor.clearSelection();
    this.cursor.moveToLineEnd();
    this.updateCaret();
  } else if (code === 'Enter') {
    // Enter는 조합 확정만으로 충분 (줄바꿈은 별도 처리 불필요)
  }
}

export function handleBackspace(this: any, pos: DocumentPosition, inCell: boolean): void {
  // 머리말/꼬리말 편집 모드
  if (this.cursor.isInHeaderFooter()) {
    const isHeader = this.cursor.headerFooterMode === 'header';
    const hfOff = this.cursor.hfCharOffset;
    if (hfOff > 0) {
      this.wasm.deleteTextInHeaderFooter(
        this.cursor.hfSectionIdx, isHeader, this.cursor.hfApplyTo,
        this.cursor.hfParaIdx, hfOff - 1, 1,
      );
      this.cursor.setHfCursorPosition(this.cursor.hfParaIdx, hfOff - 1);
      this.afterEdit();
    } else if (this.cursor.hfParaIdx > 0) {
      // 문단 시작에서 Backspace → 이전 문단과 병합
      const result = JSON.parse(this.wasm.mergeParagraphInHeaderFooter(
        this.cursor.hfSectionIdx, isHeader, this.cursor.hfApplyTo,
        this.cursor.hfParaIdx,
      ));
      this.cursor.setHfCursorPosition(result.hfParaIndex, result.charOffset);
      this.afterEdit();
    }
    return;
  }

  const { charOffset } = pos;

  // 필드 경계 보호: 필드 시작 위치에서는 Backspace 차단
  try {
    const fi = this.wasm.getFieldInfoAt(pos);
    if (fi.inField && charOffset <= fi.startCharIdx) return;
  } catch { /* 무시 */ }

  if (inCell) {
    if (charOffset > 0) {
      const deletePos = { ...pos, charOffset: charOffset - 1 };
      this.executeOperation({ kind: 'command', command: new DeleteTextCommand(deletePos, 1, 'backward') });
    } else if (pos.cellParaIndex! > 0) {
      // 셀 문단 시작에서 Backspace → 이전 셀 문단과 병합
      this.executeOperation({ kind: 'command', command: new MergeParagraphInCellCommand(pos) });
    }
  } else {
    const { sectionIndex: sec, paragraphIndex: para } = pos;
    if (charOffset > 0) {
      const deletePos = { ...pos, charOffset: charOffset - 1 };
      this.executeOperation({ kind: 'command', command: new DeleteTextCommand(deletePos, 1, 'backward') });
    } else if (para > 0) {
      // 문단 시작에서 Backspace → 이전 문단과 병합
      this.executeOperation({ kind: 'command', command: new MergeParagraphCommand({ sectionIndex: sec, paragraphIndex: para, charOffset: 0 }) });
    }
  }
}

export function handleDelete(this: any, pos: DocumentPosition, inCell: boolean): void {
  // 머리말/꼬리말 편집 모드
  if (this.cursor.isInHeaderFooter()) {
    const isHeader = this.cursor.headerFooterMode === 'header';
    try {
      const info = JSON.parse(this.wasm.getHeaderFooterParaInfo(
        this.cursor.hfSectionIdx, isHeader, this.cursor.hfApplyTo,
        this.cursor.hfParaIdx,
      ));
      const hfOff = this.cursor.hfCharOffset;
      if (hfOff < info.charCount) {
        this.wasm.deleteTextInHeaderFooter(
          this.cursor.hfSectionIdx, isHeader, this.cursor.hfApplyTo,
          this.cursor.hfParaIdx, hfOff, 1,
        );
        this.afterEdit();
      } else if (this.cursor.hfParaIdx + 1 < info.paraCount) {
        // 문단 끝에서 Delete → 다음 문단과 병합 (다음 문단을 merge)
        const result = JSON.parse(this.wasm.mergeParagraphInHeaderFooter(
          this.cursor.hfSectionIdx, isHeader, this.cursor.hfApplyTo,
          this.cursor.hfParaIdx + 1,
        ));
        this.cursor.setHfCursorPosition(result.hfParaIndex, result.charOffset);
        this.afterEdit();
      }
    } catch { /* ignore */ }
    return;
  }

  const { charOffset } = pos;

  // 필드 경계 보호: 필드 끝 위치에서는 Delete 차단
  try {
    const fi = this.wasm.getFieldInfoAt(pos);
    if (fi.inField && charOffset >= fi.endCharIdx) return;
  } catch { /* 무시 */ }

  if (inCell) {
    const sec = pos.sectionIndex;
    const ppi = pos.parentParaIndex!;
    const ci = pos.controlIndex!;
    const cei = pos.cellIndex!;
    const cpi = pos.cellParaIndex!;
    const paraLen = this.wasm.getCellParagraphLength(sec, ppi, ci, cei, cpi);
    if (charOffset < paraLen) {
      this.executeOperation({ kind: 'command', command: new DeleteTextCommand(pos, 1, 'forward') });
    } else {
      // 셀 문단 끝에서 Delete → 다음 셀 문단과 병합
      const paraCount = this.wasm.getCellParagraphCount(sec, ppi, ci, cei);
      if (cpi + 1 < paraCount) {
        this.executeOperation({ kind: 'command', command: new MergeNextParagraphInCellCommand(pos) });
      }
    }
  } else {
    const { sectionIndex: sec, paragraphIndex: para } = pos;
    const paraLen = this.wasm.getParagraphLength(sec, para);
    if (charOffset < paraLen) {
      this.executeOperation({ kind: 'command', command: new DeleteTextCommand(pos, 1, 'forward') });
    } else {
      // 문단 끝에서 Delete → 다음 문단과 병합
      const paraCount = this.wasm.getParagraphCount(sec);
      if (para + 1 < paraCount) {
        this.executeOperation({ kind: 'command', command: new MergeNextParagraphCommand(pos) });
      }
    }
  }
}

export function onCompositionStart(this: any): void {
  // 선택 영역이 있으면 삭제 후 조합 시작
  if (this.cursor.hasSelection()) {
    this.deleteSelection();
  }
  this.isComposing = true;
  if (this.cursor.isInHeaderFooter()) {
    // 머리말/꼬리말 모드에서는 hfCharOffset을 anchor의 charOffset으로 사용
    this.compositionAnchor = {
      ...this.cursor.getPosition(),
      charOffset: this.cursor.hfCharOffset,
    };
  } else if (this.cursor.isInFootnote()) {
    // 각주 모드에서는 fnCharOffset을 anchor의 charOffset으로 사용
    this.compositionAnchor = {
      ...this.cursor.getPosition(),
      charOffset: this.cursor.fnCharOffset,
    };
  } else {
    this.compositionAnchor = this.cursor.getPosition();
  }
  this.compositionLength = 0;
}

export function onCompositionEnd(this: any): void {
  const anchor = this.compositionAnchor;
  const finalLength = this.compositionLength;

  this.isComposing = false;
  this.compositionAnchor = null;
  this.compositionLength = 0;
  this.textarea.value = '';
  this.caret.hideComposition();

  // 더블 자음 분리 방지: compositionEnd 시점에 조합 완료된 텍스트 기억
  // 직후 유령 input 이벤트에서 동일 텍스트가 오면 무시
  this._lastComposedText = (finalLength > 0 && this._lastCompositionText) ? this._lastCompositionText : '';

  // 조합 중 WASM 직접 호출로 이미 문서에 삽입된 텍스트를
  // Command로 기록하여 Undo 가능하게 한다.
  // 머리말/꼬리말·각주 모드에서는 Undo 기록 생략 (별도 Undo 시스템 없음)
  if (anchor && finalLength > 0 && !this.cursor.isInHeaderFooter() && !this.cursor.isInFootnote()) {
    const insertedText = this.getTextAt(anchor, finalLength);
    if (insertedText) {
      // execute() 없이 히스토리에만 기록 (텍스트는 이미 문서에 있음)
      this.executeOperation({ kind: 'record', command: new InsertTextCommand(anchor, insertedText) });
    }
  }

  // 조합 종료 후 대기 중인 탐색 키 처리 (IME 조합 중 방향키 등)
  if (this._pendingNavAfterIME) {
    const nav = this._pendingNavAfterIME;
    this._pendingNavAfterIME = null;
    processPendingNav.call(this, nav);
  }
}

export function getTextAt(this: any, pos: DocumentPosition, count: number): string {
  try {
    if ((pos.cellPath?.length ?? 0) > 1 && pos.parentParaIndex !== undefined) {
      return this.wasm.getTextInCellByPath(pos.sectionIndex, pos.parentParaIndex, JSON.stringify(pos.cellPath), pos.charOffset, count);
    } else if (pos.parentParaIndex !== undefined) {
      return this.wasm.getTextInCell(pos.sectionIndex, pos.parentParaIndex, pos.controlIndex!, pos.cellIndex!, pos.cellParaIndex!, pos.charOffset, count);
    } else {
      return this.wasm.getTextRange(pos.sectionIndex, pos.paragraphIndex, pos.charOffset, count);
    }
  } catch {
    return '';
  }
}

export function onInput(this: any): void {
  if (!this.active) return;

  const text = this.textarea.value;

  // IME 조합 중: 이전 조합 텍스트 삭제 → 현재 조합 텍스트 삽입 (실시간 렌더링)
  // Undo 스택에는 기록하지 않음 (compositionend에서 한 번에 기록)
  if (this.isComposing && this.compositionAnchor) {
    const anchor = this.compositionAnchor;

    // 이전 조합 텍스트 삭제
    if (this.compositionLength > 0) {
      this.deleteTextAt(anchor, this.compositionLength);
    }

    // 현재 조합 텍스트 삽입
    if (text) {
      this.insertTextAtRaw(anchor, text);
      this.compositionLength = text.length;
      this._lastCompositionText = text; // 더블 자음 분리 방지용
      if (this.cursor.isInHeaderFooter()) {
        this.cursor.setHfCursorPosition(this.cursor.hfParaIdx, anchor.charOffset + text.length);
      } else if (this.cursor.isInFootnote()) {
        this.cursor.setFnCursorPosition(this.cursor.fnInnerParaIdx, anchor.charOffset + text.length);
      } else {
        this.cursor.moveTo({ ...anchor, charOffset: anchor.charOffset + text.length });
      }
    } else {
      this.compositionLength = 0;
      if (this.cursor.isInHeaderFooter()) {
        this.cursor.setHfCursorPosition(this.cursor.hfParaIdx, anchor.charOffset);
      } else if (this.cursor.isInFootnote()) {
        this.cursor.setFnCursorPosition(this.cursor.fnInnerParaIdx, anchor.charOffset);
      } else {
        this.cursor.moveTo(anchor);
      }
    }

    this.afterEdit();
    return;
  }

  // iOS 폴백: composition 이벤트 없이 input만으로 한글 조합 처리
  // iOS에서는 compositionStart가 발생하지 않고 input만 연속 발생한다.
  // contentEditable div의 textContent가 누적되므로 이전 텍스트를 교체한다.
  if (this._isIOS && !this.isComposing) {
    // 조합 앵커 설정 (첫 입력 시)
    if (!this._iosComposing) {
      this._iosComposing = true;
      if (this.cursor.isInHeaderFooter()) {
        this._iosAnchor = { ...this.cursor.getPosition(), charOffset: this.cursor.hfCharOffset };
      } else if (this.cursor.isInFootnote()) {
        this._iosAnchor = { ...this.cursor.getPosition(), charOffset: this.cursor.fnCharOffset };
      } else {
        this._iosAnchor = this.cursor.getPosition();
      }
      this._iosLength = 0;
    }

    if (this._iosAnchor && text) {
      // 이전 텍스트 삭제
      if (this._iosLength > 0) {
        this.deleteTextAt(this._iosAnchor, this._iosLength);
      }
      // 현재 전체 텍스트 삽입
      this.insertTextAtRaw(this._iosAnchor, text);
      this._iosLength = text.length;

      // 커서 이동
      if (this.cursor.isInHeaderFooter()) {
        this.cursor.setHfCursorPosition(this.cursor.hfParaIdx, this._iosAnchor.charOffset + text.length);
      } else if (this.cursor.isInFootnote()) {
        this.cursor.setFnCursorPosition(this.cursor.fnInnerParaIdx, this._iosAnchor.charOffset + text.length);
      } else {
        this.cursor.moveTo({ ...this._iosAnchor, charOffset: this._iosAnchor.charOffset + text.length });
      }
      this.afterEdit();
    }

    // 조합 종료 감지: 일정 시간 입력이 없으면 조합 완료로 간주
    clearTimeout(this._iosInputTimer);
    this._iosInputTimer = setTimeout(() => {
      if (this._iosComposing) {
        this._iosComposing = false;
        this._iosAnchor = null;
        this._iosLength = 0;
        this.textarea.value = '';
      }
    }, 500);
    return;
  }

  // 일반 입력 (비조합) → Command로 실행
  if (!text) return;

  // 더블 자음 분리 방지: compositionEnd 직후 유령 input 이벤트 감지
  // 각주/머리말꼬리말 모드에서 조합 완료 직후 동일 텍스트가 오면 무시
  if (this._lastComposedText && text === this._lastComposedText) {
    this._lastComposedText = '';
    this.textarea.value = '';
    return;
  }
  this._lastComposedText = '';
  this.textarea.value = '';

  // 머리말/꼬리말 편집 모드
  if (this.cursor.isInHeaderFooter()) {
    const isHeader = this.cursor.headerFooterMode === 'header';
    try {
      this.wasm.insertTextInHeaderFooter(
        this.cursor.hfSectionIdx, isHeader, this.cursor.hfApplyTo,
        this.cursor.hfParaIdx, this.cursor.hfCharOffset, text,
      );
      this.cursor.setHfCursorPosition(this.cursor.hfParaIdx, this.cursor.hfCharOffset + text.length);
      this.afterEdit();
    } catch (err) {
      console.error('[HF-input] insertTextInHeaderFooter 실패:', err);
    }
    return;
  }

  // 각주 편집 모드
  if (this.cursor.isInFootnote()) {
    try {
      this.wasm.insertTextInFootnote(
        this.cursor.fnSectionIdx, this.cursor.fnParaIdx, this.cursor.fnControlIdx,
        this.cursor.fnInnerParaIdx, this.cursor.fnCharOffset, text,
      );
      this.cursor.setFnCursorPosition(this.cursor.fnInnerParaIdx, this.cursor.fnCharOffset + text.length);
      this.afterEdit();
    } catch (err) {
      console.error('[FN-input] insertTextInFootnote 실패:', err);
    }
    return;
  }

  // 선택 영역이 있으면 먼저 삭제
  if (this.cursor.hasSelection()) {
    this.deleteSelection();
  }
  this.executeOperation({ kind: 'command', command: new InsertTextCommand(this.cursor.getPosition(), text) });
}

export function insertTextAtRaw(this: any, pos: DocumentPosition, text: string): void {
  // 머리말/꼬리말 편집 모드
  if (this.cursor.isInHeaderFooter()) {
    const isHeader = this.cursor.headerFooterMode === 'header';
    this.wasm.insertTextInHeaderFooter(
      this.cursor.hfSectionIdx, isHeader, this.cursor.hfApplyTo,
      this.cursor.hfParaIdx, pos.charOffset, text,
    );
    return;
  }
  // 각주 편집 모드
  if (this.cursor.isInFootnote()) {
    this.wasm.insertTextInFootnote(
      this.cursor.fnSectionIdx, this.cursor.fnParaIdx, this.cursor.fnControlIdx,
      this.cursor.fnInnerParaIdx, pos.charOffset, text,
    );
    return;
  }
  if ((pos.cellPath?.length ?? 0) > 1 && pos.parentParaIndex !== undefined) {
    this.wasm.insertTextInCellByPath(pos.sectionIndex, pos.parentParaIndex!, JSON.stringify(pos.cellPath), pos.charOffset, text);
  } else if (pos.parentParaIndex !== undefined) {
    const { sectionIndex: sec, parentParaIndex: ppi, controlIndex: ci, cellIndex: cei, cellParaIndex: cpi, charOffset } = pos;
    this.wasm.insertTextInCell(sec, ppi!, ci!, cei!, cpi!, charOffset, text);
  } else {
    const { sectionIndex: sec, paragraphIndex: para, charOffset } = pos;
    this.wasm.insertText(sec, para, charOffset, text);
  }
}

export function deleteTextAt(this: any, pos: DocumentPosition, count: number): void {
  // 머리말/꼬리말 편집 모드
  if (this.cursor.isInHeaderFooter()) {
    const isHeader = this.cursor.headerFooterMode === 'header';
    this.wasm.deleteTextInHeaderFooter(
      this.cursor.hfSectionIdx, isHeader, this.cursor.hfApplyTo,
      this.cursor.hfParaIdx, pos.charOffset, count,
    );
    return;
  }
  // 각주 편집 모드
  if (this.cursor.isInFootnote()) {
    this.wasm.deleteTextInFootnote(
      this.cursor.fnSectionIdx, this.cursor.fnParaIdx, this.cursor.fnControlIdx,
      this.cursor.fnInnerParaIdx, pos.charOffset, count,
    );
    return;
  }
  if ((pos.cellPath?.length ?? 0) > 1 && pos.parentParaIndex !== undefined) {
    this.wasm.deleteTextInCellByPath(pos.sectionIndex, pos.parentParaIndex!, JSON.stringify(pos.cellPath), pos.charOffset, count);
  } else if (pos.parentParaIndex !== undefined) {
    const { sectionIndex: sec, parentParaIndex: ppi, controlIndex: ci, cellIndex: cei, cellParaIndex: cpi, charOffset } = pos;
    this.wasm.deleteTextInCell(sec, ppi!, ci!, cei!, cpi!, charOffset, count);
  } else {
    const { sectionIndex: sec, paragraphIndex: para, charOffset } = pos;
    this.wasm.deleteText(sec, para, charOffset, count);
  }
}

