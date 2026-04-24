export interface NewGroupInputProps {
  value: string;
  validationMessage: string | null;
}

export function renderNewGroupInput(props: NewGroupInputProps): HTMLElement {
  const wrapper = document.createElement("form");
  wrapper.className = "new-group-input";
  wrapper.id = "new-group-form";
  wrapper.innerHTML = `
    <div class="new-group-input__row">
      <input
        id="new-group-input"
        class="new-group-input__field"
        name="groupName"
        type="text"
        placeholder="Group name"
        value="${escapeHtml(props.value)}"
        autocomplete="off"
      />
      <button type="submit" class="new-group-input__action new-group-input__action--confirm" aria-label="Confirm new group">
        ${renderCheckIcon()}
      </button>
      <button type="button" class="new-group-input__action" data-action="cancel-new-group" aria-label="Cancel new group">
        ${renderCloseIcon()}
      </button>
    </div>
    ${props.validationMessage ? `<p class="new-group-input__validation">${escapeHtml(props.validationMessage)}</p>` : ""}
  `;
  return wrapper;
}

function renderCheckIcon(): string {
  return `
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3.5 7.29L5.83 9.62L10.5 4.96" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
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
