import { useEffect } from 'react';

/**
 * Universal Excel-Style Keyboard Arrow Key Navigation System for MY PUMP ERP.
 * Enables ArrowUp, ArrowDown, ArrowLeft, ArrowRight, and Enter key navigation
 * across tables, input grids, forms, and cards throughout the entire application.
 */
export function useExcelNavigation() {
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const { key, target } = e;

      // Only handle Arrow Keys & Enter
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(key)) {
        return;
      }

      // Ensure active element is an input, select, or textarea
      if (!target || !['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) {
        return;
      }

      // Ignore buttons, range sliders, radios, checkboxes, file inputs
      if (['button', 'submit', 'radio', 'checkbox', 'file', 'range'].includes(target.type)) {
        return;
      }

      // Check if current target is inside a table cell, grid cell, card, or form container
      const currentCell = target.closest('td, th, .grid-cell, .form-cell');
      const currentTr = target.closest('tr, .grid-row, .form-row');
      const table = target.closest('table, tbody, .excel-grid-container, [data-grid-container]');

      if (!table) return;

      // 1. TABLE CELL GRID NAVIGATION STRATEGY
      if (currentTr && currentCell) {
        const rows = Array.from(table.querySelectorAll('tr, .grid-row'));
        const rowIndex = rows.indexOf(currentTr);
        const cells = Array.from(currentTr.querySelectorAll('td, th, .grid-cell, .form-cell'));
        const cellIndex = cells.indexOf(currentCell);

        let targetInput = null;

        if (key === 'ArrowDown' || key === 'Enter') {
          // Navigate Down to same column in next row
          const nextRow = rows[rowIndex + 1];
          if (nextRow) {
            const targetCell = nextRow.querySelectorAll('td, th, .grid-cell, .form-cell')[cellIndex];
            targetInput = targetCell ? targetCell.querySelector('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])') : null;
          } else {
            // Jump to the next table / dispenser card container on page
            const allTables = Array.from(document.querySelectorAll('table, .excel-grid-container, [data-grid-container]'));
            const tableIdx = allTables.indexOf(table);
            const nextTable = allTables[tableIdx + 1];
            if (nextTable) {
              const firstRow = nextTable.querySelector('tr, .grid-row');
              if (firstRow) {
                const targetCell = firstRow.querySelectorAll('td, th, .grid-cell, .form-cell')[cellIndex] || firstRow.querySelectorAll('td, th, .grid-cell, .form-cell')[0];
                targetInput = targetCell ? targetCell.querySelector('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])') : null;
              }
            }
          }
          if (targetInput) e.preventDefault();
        } else if (key === 'ArrowUp') {
          // Navigate Up to same column in previous row
          const prevRow = rows[rowIndex - 1];
          if (prevRow) {
            const targetCell = prevRow.querySelectorAll('td, th, .grid-cell, .form-cell')[cellIndex];
            targetInput = targetCell ? targetCell.querySelector('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])') : null;
          } else {
            // Jump to previous table / dispenser card container on page
            const allTables = Array.from(document.querySelectorAll('table, .excel-grid-container, [data-grid-container]'));
            const tableIdx = allTables.indexOf(table);
            const prevTable = allTables[tableIdx - 1];
            if (prevTable) {
              const allRowsInPrev = Array.from(prevTable.querySelectorAll('tr, .grid-row'));
              const lastRow = allRowsInPrev[allRowsInPrev.length - 1];
              if (lastRow) {
                const targetCell = lastRow.querySelectorAll('td, th, .grid-cell, .form-cell')[cellIndex] || lastRow.querySelectorAll('td, th, .grid-cell, .form-cell')[0];
                targetInput = targetCell ? targetCell.querySelector('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])') : null;
              }
            }
          }
          if (targetInput) e.preventDefault();
        } else if (key === 'ArrowRight') {
          // Navigate Right to next cell in same row
          const isAtEnd = target.tagName === 'SELECT' || target.type === 'date' || target.selectionEnd === target.value?.length || target.selectionEnd === null;
          if (isAtEnd) {
            const nextCell = cells[cellIndex + 1];
            if (nextCell) {
              targetInput = nextCell.querySelector('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])');
            } else if (rows[rowIndex + 1]) {
              // Wrap to first cell of next row
              const nextRowCells = rows[rowIndex + 1].querySelectorAll('td, th, .grid-cell, .form-cell');
              targetInput = nextRowCells[0]?.querySelector('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])');
            }
            if (targetInput) e.preventDefault();
          }
        } else if (key === 'ArrowLeft') {
          // Navigate Left to previous cell in same row
          const isAtStart = target.tagName === 'SELECT' || target.type === 'date' || target.selectionStart === 0 || target.selectionStart === null;
          if (isAtStart) {
            const prevCell = cells[cellIndex - 1];
            if (prevCell) {
              targetInput = prevCell.querySelector('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])');
            } else if (rows[rowIndex - 1]) {
              // Wrap to last cell of previous row
              const prevRowCells = rows[rowIndex - 1].querySelectorAll('td, th, .grid-cell, .form-cell');
              const lastCell = prevRowCells[prevRowCells.length - 1];
              targetInput = lastCell?.querySelector('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])');
            }
            if (targetInput) e.preventDefault();
          }
        }

        if (targetInput) {
          targetInput.focus();
          if (typeof targetInput.select === 'function') {
            setTimeout(() => {
              try { targetInput.select(); } catch (_) {}
            }, 10);
          }
          return;
        }
      }

      // 2. FALLBACK INPUT SEQUENCE NAVIGATION (For non-table forms or flat input lists)
      const allInputs = Array.from(table.querySelectorAll('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'));
      const idx = allInputs.indexOf(target);
      if (idx === -1) return;

      let nextTarget = null;
      if (key === 'ArrowDown' || key === 'Enter') {
        nextTarget = allInputs[idx + 1];
        if (nextTarget) e.preventDefault();
      } else if (key === 'ArrowUp') {
        nextTarget = allInputs[idx - 1];
        if (nextTarget) e.preventDefault();
      }

      if (nextTarget) {
        nextTarget.focus();
        if (typeof nextTarget.select === 'function') {
          setTimeout(() => {
            try { nextTarget.select(); } catch (_) {}
          }, 10);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, []);
}
