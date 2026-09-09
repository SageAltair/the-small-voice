import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ChevronRight, Eye, FolderOpen, ImagePlus, Library, LogOut, Pencil, Plus, RotateCcw, Search, Tags, Trash2, Users, X } from "lucide-react";
import RichTextEditor from "../components/RichTextEditor";
import BrandMark from "../components/BrandMark";
import SubmissionReview from "../components/SubmissionReview";
import { addStoryTags, createAdminItem, createStory, createUploadedAdminResource, deleteAdminItem, getAdminData, getTrash, login, permanentDeleteTrashItem, restoreTrashItem, updateAdminItem, uploadAdminImage, uploadAdminResource, uploadResourceCarousel } from "../services/api";

const sections = [
  { id: "stories", label: "Stories", icon: BookOpen },
  { id: "approvals", label: "Approvals", icon: CheckCircle2 },
  { id: "resources", label: "Resources", icon: Library },
  { id: "tags", label: "Topics", icon: Tags },
  { id: "users", label: "People", icon: Users },
  { id: "trash", label: "Trash", icon: Trash2 },
];
const storyBlank = { title: "", slug: "", author: "", category: "", content: "", image_url: "", published: true, featured: false, tags: [] };
const resourceBlank = { title: "", description: "", resource_type: "", url: "", downloadable: false, published: true };
const tagBlank = { name: "", slug: "" };
const slugify = (text) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const singularLabel = (type) => ({ stories: "story", approvals: "story", resources: "resource", tags: "topic", users: "person", trash: "item" }[type] || type);

export default function AdminConsole() {
  const [data, setData] = useState(null);
  const [section, setSection] = useState("stories");
  const [editor, setEditor] = useState(null);
  const [resourceFile, setResourceFile] = useState(null);
  const [carouselFiles, setCarouselFiles] = useState([]);
  const [query, setQuery] = useState("");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [trash, setTrash] = useState(null);
  const [reviewItem, setReviewItem] = useState(null);

  const refresh = async () => {
    // Always reload the main lists AND the trash together so counts/rows
    // stay consistent after every delete, restore, or permanent delete.
    const overview = await getAdminData();
    setData(overview);
    try {
      setTrash(await getTrash());
    } catch (err) {
      // Data still loaded; trash badge just stays as it was.
    }
  };

  const loadTrash = async () => {
    try {
      setTrash(await getTrash());
    } catch (err) {
      showError(err);
    }
  };

  useEffect(() => {
    if (localStorage.getItem("access_token")) {
      refresh().catch(() => localStorage.removeItem("access_token"));
    }
  }, []);

  const showError = (err) => {
    setNotice("");
    setError(err.message || "Something went wrong.");
  };

  const close = () => {
    setEditor(null);
    setResourceFile(null);
    setCarouselFiles([]);
    setError("");
  };

  function open(type, item = null) {
    setError("");
    setResourceFile(null);
    setCarouselFiles([]);
    const blank = type === "stories" ? storyBlank : type === "resources" ? resourceBlank : type === "tags" ? tagBlank : {};
    setEditor({ type, item, draft: item ? { ...item, tags: item.tags?.map((tag) => tag.id) || [] } : blank });
  }

  const change = (name, value) =>
    setEditor((current) => ({
      ...current,
      draft: { ...current.draft, [name]: value },
    }));

  async function signIn(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const user = await login(loginForm.username, loginForm.password);
      if (user.role !== "admin") throw new Error("Administrator access is required.");
      await refresh();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { type, item, draft } = editor;
      if (type === "stories") {
        const fields = {
          title: draft.title,
          slug: draft.slug,
          author: draft.author,
          category: draft.category,
          content: draft.content,
          image_url: draft.image_url || null,
          published: draft.published,
          featured: draft.featured,
        };
        let id = item?.id;
        if (item) {
          await updateAdminItem(type, id, fields);
        } else {
          const form = new FormData();
          Object.entries(fields).forEach(([key, value]) => form.append(key, value));
          id = (await createStory(form)).id;
        }
        await addStoryTags(id, draft.tags);
      } else if (type === "resources") {
        let saved;
        if (resourceFile && !item) {
          saved = await createUploadedAdminResource(resourceFile, draft, carouselFiles);
        } else {
          const url = resourceFile ? await uploadAdminResource(resourceFile) : draft.url;
          if (!url) throw new Error("Add a web link or upload a local file.");
          const fields = { ...draft, url, downloadable: resourceFile ? true : draft.downloadable };
          saved = item ? (await updateAdminItem(type, item.id, fields), { id: item.id }) : await createAdminItem(type, fields);
          if (carouselFiles.length) await uploadResourceCarousel(saved.id, carouselFiles);
        }
      } else if (item) {
        await updateAdminItem(type, item.id, draft);
      } else {
        await createAdminItem(type, draft);
      }
      await refresh();
      close();
      setNotice(`${singularLabel(type)} saved successfully.`);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function uploadCover(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      change("image_url", await uploadAdminImage(file));
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!window.confirm("Move this item to trash?")) return;
    setBusy(true);
    try {
      await deleteAdminItem(section, id);
      await refresh();
      setNotice("Item moved to trash.");
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function restoreItem(type, id) {
    setBusy(true);
    try {
      await restoreTrashItem(type, id);
      await refresh();
      setNotice("Item restored.");
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function permanentlyDelete(type, id) {
    if (!window.confirm("Permanently delete this item? This cannot be undone.")) return;
    setBusy(true);
    try {
      await permanentDeleteTrashItem(type, id);
      await refresh();
      setNotice("Item permanently deleted.");
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function approveItem(item) {
    setBusy(true);
    setError("");
    try {
      await updateAdminItem(item._type || "stories", item.id, { published: true });
      await refresh();
      setNotice(`"${item.title}" is now published.`);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  const items = useMemo(() => {
    if (!data) return [];
    // The Trash tab renders from its own `trash` state, not from data[section].
    // Guard here so switching to Trash never touches data["trash"] (undefined).
    if (section === "trash") return [];
    const source =
      section === "approvals"
        ? [
            ...data.stories.filter((story) => !story.published).map((item) => ({ ...item, _type: "stories" })),
            ...data.resources.filter((resource) => !resource.published).map((item) => ({ ...item, _type: "resources" })),
          ]
        : data[section];
    const term = query.toLowerCase();
    return source.filter(
      (item) =>
        !term ||
        [item.title, item.name, item.username, item.email, item.author, item.category, item.resource_type]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term)
    );
  }, [data, section, query]);

  if (!data)
    return (
      <main className="admin-shell login-shell">
        <section className="cms-login">
          <div className="cms-login-brand">
            <BrandMark />
            <span>The Small Voice</span>
          </div>
          <p className="eyebrow">Content studio</p>
          <h1>Welcome back.</h1>
          <p>Sign in to publish stories and care for your community.</p>
          <form onSubmit={signIn}>
            <label>
              Username
              <input autoComplete="username" value={loginForm.username} onChange={(event) => setLoginForm({ ...loginForm, username: event.target.value })} required />
            </label>
            <label>
              Password
              <input type="password" autoComplete="current-password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} required />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="button" type="submit" disabled={busy}>
              Sign in <ChevronRight size={16} />
            </button>
          </form>
        </section>
      </main>
    );

  const active = sections.find((item) => item.id === section);
  const { draft } = editor || {};
  const pendingCount = section !== "trash" ? data.stories.filter((story) => !story.published).length : 0;

  return (
    <main className="admin-shell">
      <aside className="cms-sidebar">
        <a className="cms-brand" href="/">
          <BrandMark />
          <span>The Small Voice</span>
        </a>
        <span className="cms-nav-label">Workspace</span>
        <nav className="cms-nav">
          {sections.map(({ id, label, icon: TabIcon }) => (
            <button
              key={id}
              className={section === id ? "active" : ""}
              onClick={() => {
                setSection(id);
                setQuery("");
                close();
                if (id === "trash") loadTrash();
              }}
            >
              <TabIcon size={18} />
              <span>{label}</span>
              <b>
                {id === "approvals"
                  ? pendingCount
                  : id === "trash"
                    ? trash
                      ? trash.stories.length + trash.resources.length + trash.tags.length + trash.users.length
                      : 0
                    : data[id].length}
              </b>
            </button>
          ))}
        </nav>
        <div className="cms-sidebar-footer">
          <a href="/" target="_blank" rel="noreferrer">
            View website <ChevronRight size={15} />
          </a>
          <button onClick={() => { localStorage.removeItem("access_token"); setData(null); }}>
            <LogOut size={16} />Sign out
          </button>
        </div>
      </aside>
      <section className="cms-workspace">
        <header className="cms-topbar">
          <div>
            <p className="eyebrow">Content management</p>
            <h1>{active.label}</h1>
          </div>
          {section !== "approvals" && section !== "trash" && (
            <button className="button" onClick={() => open(section)} disabled={section === "users"}>
              <Plus size={16} />New {singularLabel(section)}
            </button>
          )}
        </header>
        {notice && (
          <div className="cms-notice">
            <CheckCircle2 size={17} />
            {notice}
            <button onClick={() => setNotice("")}><X size={16} /></button>
          </div>
        )}
        {error && <div className="cms-alert">{error}</div>}
        <section className="cms-overview">
          {section !== "trash" && (
            <>
              <article>
                <span>Published stories</span>
                <strong>{data.stories.filter((item) => item.published).length}</strong>
                <small>{data.stories.filter((item) => !item.published).length} drafts</small>
              </article>
              <article>
                <span>Learning resources</span>
                <strong>{data.resources.length}</strong>
                <small>Ready to explore</small>
              </article>
              <article>
                <span>Community members</span>
                <strong>{data.users.filter((item) => item.is_active).length}</strong>
                <small>Active members</small>
              </article>
            </>
          )}
        </section>
        <div className="cms-list-toolbar">
          <label className="cms-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${active.label.toLowerCase()}...`}
            />
          </label>
        </div>
        <section className="cms-list">
          {section === "trash" ? (
            trash ? (
              <>
                {trash.stories.length === 0 && trash.resources.length === 0 && trash.tags.length === 0 && trash.users.length === 0 ? (
                  <div className="cms-empty">
                    <Trash2 size={24} />
                    <p>Trash is empty</p>
                  </div>
                ) : (
                  <>
                    {trash.stories.length > 0 && (
                      <>
                        <div className="cms-list-header">
                          <span>Stories</span>
                          <span>Details</span>
                          <span>Actions</span>
                        </div>
                        {trash.stories.map((item) => (
                          <article className="cms-row" key={`stories:${item.id}`}>
                            <div className="cms-row-title">
                              <strong>{item.title}</strong>
                              <small>{item.author}</small>
                            </div>
                            <div className="cms-row-meta">
                              <span>{item.tags?.length || 0} topics</span>
                            </div>
                            <div className="cms-row-actions">
                              <button className="icon-button" title="Restore" onClick={() => restoreItem("stories", item.id)}>
                                <RotateCcw size={16} />
                              </button>
                              <button className="icon-button danger" title="Delete permanently" onClick={() => permanentlyDelete("stories", item.id)}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </article>
                        ))}
                      </>
                    )}
                    {trash.resources.length > 0 && (
                      <>
                        <div className="cms-list-header">
                          <span>Resources</span>
                          <span>Details</span>
                          <span>Actions</span>
                        </div>
                        {trash.resources.map((item) => (
                          <article className="cms-row" key={`resources:${item.id}`}>
                            <div className="cms-row-title">
                              <strong>{item.title}</strong>
                              <small>{item.resource_type || "Resource"}</small>
                            </div>
                            <div className="cms-row-meta">
                              <span>{item.description || item.url}</span>
                            </div>
                            <div className="cms-row-actions">
                              <button className="icon-button" title="Restore" onClick={() => restoreItem("resources", item.id)}>
                                <RotateCcw size={16} />
                              </button>
                              <button className="icon-button danger" title="Delete permanently" onClick={() => permanentlyDelete("resources", item.id)}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </article>
                        ))}
                      </>
                    )}
                    {trash.tags.length > 0 && (
                      <>
                        <div className="cms-list-header">
                          <span>Topics</span>
                          <span>Details</span>
                          <span>Actions</span>
                        </div>
                        {trash.tags.map((item) => (
                          <article className="cms-row" key={`tags:${item.id}`}>
                            <div className="cms-row-title">
                              <strong>{item.name}</strong>
                              <small>{item.slug}</small>
                            </div>
                            <div className="cms-row-meta">
                              <span>{item.language}</span>
                            </div>
                            <div className="cms-row-actions">
                              <button className="icon-button" title="Restore" onClick={() => restoreItem("tags", item.id)}>
                                <RotateCcw size={16} />
                              </button>
                              <button className="icon-button danger" title="Delete permanently" onClick={() => permanentlyDelete("tags", item.id)}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </article>
                        ))}
                      </>
                    )}
                    {trash.users.length > 0 && (
                      <>
                        <div className="cms-list-header">
                          <span>People</span>
                          <span>Details</span>
                          <span>Actions</span>
                        </div>
                        {trash.users.map((item) => (
                          <article className="cms-row" key={`users:${item.id}`}>
                            <div className="cms-row-title">
                              <strong>{item.username}</strong>
                              <small>{item.email}</small>
                            </div>
                            <div className="cms-row-meta">
                              <span>{item.role}</span>
                            </div>
                            <div className="cms-row-actions">
                              <button className="icon-button" title="Restore" onClick={() => restoreItem("users", item.id)}>
                                <RotateCcw size={16} />
                              </button>
                              <button className="icon-button danger" title="Delete permanently" onClick={() => permanentlyDelete("users", item.id)}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </article>
                        ))}
                      </>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="cms-empty">
                <span>Loading trash...</span>
              </div>
            )
          ) : (
            <>
              <div className="cms-list-header">
                <span>{section === "trash" ? "Item" : active.label.slice(0, -1)}</span>
                <span>Details</span>
                <span>Actions</span>
              </div>
              {items.map((item) => (
                <article className="cms-row" key={item.id}>
                  <div className="cms-row-title">
                    {["stories", "approvals"].includes(section) && (
                      <span className={`cms-status ${item.published ? "published" : "draft"}`}>
                        {item.published ? "Published" : "Draft"}
                      </span>
                    )}
                    <strong>{item.title || item.name || item.username}</strong>
                    <small>
                      {["stories", "approvals"].includes(section)
                        ? `${item.author} · ${item.category}`
                        : section === "users"
                          ? item.email
                          : item.resource_type || item.slug}
                    </small>
                  </div>
                  <div className="cms-row-meta">
                    <span>
                      {["stories", "approvals"].includes(section)
                        ? `${item.tags?.length || 0} topics`
                        : section === "users"
                          ? item.role
                          : item.description || item.url}
                    </span>
                  </div>
                  <div className="cms-row-actions">
                    {["stories", "approvals"].includes(section) && (
                      <button
                        className={`icon-button approve ${item.published ? "approved" : ""}`}
                        title={item.published ? "Already approved" : "Approve and publish"}
                        aria-label={`${item.published ? "Approved" : "Approve"} ${item.title}`}
                        disabled={busy || item.published}
                        onClick={() => approveItem(item)}
                      >
                        <CheckCircle2 size={16} />
                        <span>{item.published ? "Approved" : "Approve"}</span>
                      </button>
                    )}
                    {["stories", "approvals", "resources"].includes(section) && (
                      <button
                        className="icon-button"
                        title="Review submission"
                        aria-label={`Review ${item.title}`}
                        onClick={() => setReviewItem(section === "approvals" ? item : { ...item, _type: section })}
                      >
                        <Eye size={16} />
                      </button>
                    )}
                    <button className="icon-button" title="Edit" onClick={() => open(section === "approvals" ? "stories" : section, item)}>
                      <Pencil size={16} />
                    </button>
                    {section !== "users" && section !== "approvals" && (
                      <button className="icon-button danger" title="Delete" onClick={() => remove(item.id)}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!items.length && (
                <div className="cms-empty">
                  <FolderOpen size={24} />
                  <p>No matching items yet.</p>
                </div>
              )}
            </>
          )}
        </section>
        {editor && (
          <div className="cms-modal-backdrop" onMouseDown={close}>
            <section className="cms-modal" onMouseDown={(event) => event.stopPropagation()}>
              <header>
                <div>
                  <p className="eyebrow">{editor.item ? "Editing" : "New"} {singularLabel(editor.type)}</p>
                  <h2>{editor.item ? `Edit ${singularLabel(editor.type)}` : `Create ${singularLabel(editor.type)}`}</h2>
                </div>
                <button className="icon-button" onClick={close}><X size={19} /></button>
              </header>
              <form onSubmit={save}>
                {editor.type === "stories" && (
                  <>
                    <div className="cms-fields">
                      <label>Title<input value={draft.title} onChange={(event) => setEditor({ ...editor, draft: { ...draft, title: event.target.value } })} required /></label>
                      <label>URL slug<input value={draft.slug} onChange={(event) => setEditor({ ...editor, draft: { ...draft, slug: event.target.value } })} required /></label>
                      <label>Author<input value={draft.author} onChange={(event) => setEditor({ ...editor, draft: { ...draft, author: event.target.value } })} required /></label>
                      <label className="wide">Category<input value={draft.category} onChange={(event) => setEditor({ ...editor, draft: { ...draft, category: event.target.value } })} required /></label>
                      <label className="wide">Language<select value={draft.language || "en"} onChange={(event) => change("language", event.target.value)}><option value="en">English</option><option value="sw">Swahili</option></select></label>
                    </div>
                    <div className="story-form-wide">
                      <span className="editor-label">Story</span>
                      <RichTextEditor value={draft.content} onChange={(content) => setEditor({ ...editor, draft: { ...draft, content } })} />
                    </div>
                    <div className="cms-media-row">
                      <label className="cms-upload">
                        <ImagePlus size={18} />
                        <span>{draft.image_url ? "Replace cover image" : "Upload cover image"}</span>
                        <input type="file" accept="image/*" onChange={uploadCover} />
                      </label>
                      {draft.image_url && <img src={draft.image_url} alt="Story cover preview" />}
                    </div>
                    <fieldset className="cms-topic-picker">
                      <legend>Topics</legend>
                      {data.tags.length ? data.tags.map((tag) => (
                        <label key={tag.id}>
                          <input
                            type="checkbox"
                            checked={draft.tags?.includes(tag.id)}
                            onChange={(event) => change("tags", event.target.checked ? [...(draft.tags || []), tag.id] : (draft.tags || []).filter((id) => id !== tag.id))}
                          />
                          {tag.name}
                        </label>
                      )) : <span>No topics yet.</span>}
                    </fieldset>
                    <div className="cms-toggles">
                      <label><input type="checkbox" checked={draft.published} onChange={(event) => setEditor({ ...editor, draft: { ...draft, published: event.target.checked } })} /> Published</label>
                      <label><input type="checkbox" checked={draft.featured} onChange={(event) => setEditor({ ...editor, draft: { ...draft, featured: event.target.checked } })} /> Featured</label>
                    </div>
                  </>
                )}
                {editor.type === "resources" && (
                  <div className="cms-fields">
                    <label>Title<input value={draft.title} onChange={(event) => setEditor({ ...editor, draft: { ...draft, title: event.target.value } })} required /></label>
                    <label>Resource type<select value={draft.resource_type} onChange={(event) => setEditor({ ...editor, draft: { ...draft, resource_type: event.target.value } })} required><option value="">Select type</option><option value="book">Book (PDF)</option><option value="photo">Photos</option><option value="video">Video</option><option value="audio">Audio</option></select></label>
                    <label className="wide">Language<select value={draft.language || "en"} onChange={(event) => change("language", event.target.value)}><option value="en">English</option><option value="sw">Swahili</option></select></label>
                    <label className="wide">Web link<input type="url" placeholder="https://example.com/resource" value={draft.url} onChange={(event) => setEditor({ ...editor, draft: { ...draft, url: event.target.value } })} /></label>
                    <label className="wide cms-file-upload">Upload local file(s) <span className="field-hint">PDF, document, audio, video, or other file — up to 300 MB each. Upload several at once to create multiple resources.</span><input type="file" multiple onChange={(event) => setResourceFile(Array.from(event.target.files || []))} />{resourceFile.length > 0 && <small>{resourceFile.length} file{resourceFile.length === 1 ? "" : "s"} selected{resourceFile.length <= 3 ? `: ${resourceFile.map((file) => file.name).join(", ")}` : ""}</small>}</label>
                    <label className="wide">Description<textarea value={draft.description} onChange={(event) => setEditor({ ...editor, draft: { ...draft, description: event.target.value } })} required /></label>
                    <label className="cms-checkbox wide"><input type="checkbox" checked={resourceFile ? true : draft.downloadable} disabled={Boolean(resourceFile)} onChange={(event) => change("downloadable", event.target.checked)} />Make this resource downloadable</label>
                  </div>
                )}
                {editor.type === "tags" && (
                  <div className="cms-fields">
                    <label>Name<input value={draft.name} onChange={(event) => { change("name", event.target.value); if (!editor.item) change("slug", slugify(event.target.value)); }} required /></label>
                    <label>URL slug<input value={draft.slug} onChange={(event) => change("slug", slugify(event.target.value))} required /></label>
                    <label className="wide">Language<select value={draft.language || "en"} onChange={(event) => change("language", event.target.value)}><option value="en">English</option><option value="sw">Swahili</option></select></label>
                  </div>
                )}
                <p className="cms-editor-note">{editor.type === "resources" && resourceFile.length > 1 ? `Each file will become its own "${draft.resource_type || "resource"}" resource.` : ""}</p>
                <footer>
                  <button className="button secondary" type="button" onClick={close}>Cancel</button>
                  <button className="button" disabled={busy} type="submit">{busy ? "Saving..." : "Save changes"}<CheckCircle2 size={16} /></button>
                </footer>
              </form>
            </section>
          </div>
        )}
        {reviewItem && (
          <SubmissionReview
            item={reviewItem}
            onClose={() => setReviewItem(null)}
            onApprove={
              reviewItem.published
                ? undefined
                : () => {
                    const target = reviewItem;
                    setReviewItem(null);
                    approveItem(target);
                  }
            }
          />
        )}
      </section>
    </main>
  );
}
