export interface NewGroupInputProps {
  value: string;
  validationMessage: string | null;
}

export function renderNewGroupInput(props: NewGroupInputProps): HTMLElement {
  const wrapper = document.createElement("form");
  wrapper.className = "new-group-modal";
  wrapper.id = "new-group-form";
  wrapper.innerHTML = `
    <div class="new-group-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="new-group-title">
      <div class="new-group-modal__header">
        <h3 id="new-group-title" class="new-group-modal__title">CREATE NEW GROUP</h3>
        <button
          type="button"
          class="new-group-modal__close"
          data-action="cancel-new-group"
          aria-label="Close new group dialog"
        >
          ${renderCloseIcon()}
        </button>
      </div>
      <div class="new-group-modal__body">
        <input
          id="new-group-input"
          class="new-group-modal__field"
          name="groupName"
          type="text"
          placeholder="Enter Tab Group Name"
          value="${escapeHtml(props.value)}"
          autocomplete="off"
        />
        ${
          props.validationMessage
            ? `<p class="new-group-modal__validation">${escapeHtml(props.validationMessage)}</p>`
            : ""
        }
      </div>
      <div class="new-group-modal__footer">
        <button
          type="submit"
          class="new-group-modal__submit${props.value.trim() ? "" : " new-group-modal__submit--disabled"}"
          ${props.value.trim() ? "" : "disabled"}
        >
          Save Group
        </button>
      </div>
    </div>
  `;
  return wrapper;
}

function renderCloseIcon(): string {
  return `
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M4.08 4.08L9.92 9.92M9.92 4.08L4.08 9.92" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
