import {
  createProject,
  deleteProject,
  duplicateProject,
  getProjectCatalog,
} from "./studio-project-store.js";

const $ = (selector) => document.querySelector(selector);
const projectList = $("#projects-list");
const status = $("#projects-status");

function renderProjects() {
  const projects = getProjectCatalog().sort((a, b) =>
    String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
  );
  projectList.replaceChildren();
  $("#projects-empty").hidden = projects.length > 0;
  for (const project of projects) {
    const item = document.createElement("li");
    item.className = "project-card";
    const details = document.createElement("div");
    details.className = "project-card-details";
    const title = document.createElement("strong");
    title.textContent = project.title;
    const updated = document.createElement("span");
    updated.className = "muted";
    updated.textContent = project.updatedAt
      ? `更新: ${new Date(project.updatedAt).toLocaleString()}`
      : "更新日時なし";
    details.append(title, updated);

    const actions = document.createElement("div");
    actions.className = "toolbar";
    const open = document.createElement("a");
    open.className = "button-like";
    open.href = `./studio.html?project=${encodeURIComponent(project.id)}`;
    open.textContent = "開く";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "コピー";
    copy.addEventListener("click", () => {
      try {
        const titles = new Set(getProjectCatalog().map((item) => item.title));
        const baseTitle = `${project.title} のコピー`;
        let title = baseTitle;
        for (let index = 2; titles.has(title); index++) title = `${baseTitle} (${index})`;
        duplicateProject(project.id, title);
        status.textContent = `「${project.title}」を「${title}」としてコピーしました。`;
        renderProjects();
      } catch (error) {
        status.textContent = `コピーに失敗しました: ${error.message}`;
      }
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger-button";
    remove.textContent = "削除";
    remove.addEventListener("click", () => {
      if (!window.confirm(`「${project.title}」を削除しますか？このプロジェクトの履歴も削除されます。`)) return;
      try {
        deleteProject(project.id);
        status.textContent = "プロジェクトを削除しました。";
        renderProjects();
      } catch (error) {
        status.textContent = `削除に失敗しました: ${error.message}`;
      }
    });
    actions.append(open, copy, remove);
    item.append(details, actions);
    projectList.append(item);
  }
}

$("#create-project-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("#new-project-name").value.trim();
  if (!name) {
    status.textContent = "プロジェクト名を入力してください。";
    return;
  }
  try {
    const project = {
      title: name,
      activeFile: "main.js",
      files: [{ name: "main.js", value: "" }],
      assets: [],
    };
    const id = createProject(name, project);
    location.href = `./studio.html?project=${encodeURIComponent(id)}`;
  } catch (error) {
    status.textContent = `作成に失敗しました: ${error.message}`;
  }
});

try {
  renderProjects();
} catch (error) {
  status.textContent = `プロジェクトを読み込めません: ${error.message}`;
}
