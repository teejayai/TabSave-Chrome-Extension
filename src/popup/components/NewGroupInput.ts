import { renderIcon } from "../icons";

export interface NewGroupInputProps {
  value: string;
  validationMessage: string | null;
}

export function renderNewGroupInput(props: NewGroupInputProps): HTMLElement {
  const form = document.createElement("form");
  form.className = "popover popover--new-group";
  form.id = "new-group-form";
  form.setAttribute("role", "dialog");
  form.setAttribute("aria-modal", "true");
  form.setAttribute("aria-labelledby", "new-group-title");
  form.innerHTML = `
    <div class="popover__header">
      <h3 id="new-group-title" class="popover__eyebrow">CREATE NEW GROUP</h3>
      <button
        type="button"
        class="popover__close"
        data-action="cancel-new-group"
        aria-label="Close new group dialog"
      >
        ${renderIcon("cancel01")}
      </button>
    </div>
    <div class="popover__body">
      <input
        id="new-group-input"
        class="field"
        name="groupName"
        type="text"
        placeholder="Enter Tab Group Name"
        value="${escapeHtml(props.value)}"
        autocomplete="off"
      />
      ${
        props.validationMessage
          ? `<p class="field__error">${escapeHtml(props.validationMessage)}</p>`
          : ""
      }
      <button
        type="submit"
        class="button button--primary button--block"
        ${props.value.trim() ? "" : "disabled"}
      >
        Save Group
      </button>
    </div>
  `;
  return form;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
