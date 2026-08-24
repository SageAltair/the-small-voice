import { useEffect, useState } from "react";
import RichTextEditor from "../components/RichTextEditor";
import { addStoryTags, createAdminItem, createStory, deleteAdminItem, getAdminData, login } from "../services/api";

const emptyStory = { title: "", slug: "", author: "", category: "", content: "" };
const emptyResource = { title: "", description: "", resource_type: "", url: "" };

export default function AdminWorkspace() {
  const [data, setData] = useState(null);
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [story, setStory] = useState(emptyStory);
  const [resource, setResource] = useState(emptyResource);
  const [newTag, setNewTag] = useState({ name: "", slug: "" });
  const [selectedTags, setSelectedTags] = useState([]);
  const [image, setImage] = useState(null);
  const [error, setError] = useState(null);

  async function refresh() { setData(await getAdminData()); }
  useEffect(() => { if (localStorage.getItem("access_token")) getAdminData().then(setData).catch(() => localStorage.removeItem("access_token")); }, []);

  async function handleLogin(event) {
    event.preventDefault();
    try { const user = await login(credentials.username, credentials.password); if (user.role !== "admin") throw new Error("This account does not have admin access"); await refresh(); } catch (err) { setError(err.message); }
  }

  async function publishStory(event) {
    event.preventDefault();
    const form = new FormData();
    Object.entries(story).forEach(([key, value]) => form.append(key, value));
    form.append("published", "true");
    if (image) form.append("image", image);
    try { const created = await createStory(form); if (selectedTags.length) await addStoryTags(created.id, selectedTags); setStory(emptyStory); setSelectedTags([]); setImage(null); await refresh(); } catch (err) { setError(err.message); }
  }

  async function addResource(event) { event.preventDefault(); try { await createAdminItem("resources", { ...resource, published: true }); setResource(emptyResource); await refresh(); } catch (err) { setError(err.message); } }
  async function addTag(event) { event.preventDefault(); try { await createAdminItem("tags", newTag); setNewTag({ name: "", slug: "" }); await refresh(); } catch (err) { setError(err.message); } }
  async function deleteItem(type, id) { if (!window.confirm("Delete this item permanently?")) return; try { await deleteAdminItem(type, id); await refresh(); } catch (err) { setError(err.message); } }

  if (!data) return <main className="container page"><section className="admin-login"><p className="eyebrow">CONTROL ROOM</p><h1>Admin sign in</h1><p>Manage stories, resources, topics, and contributors.</p><form className="story-form" onSubmit={handleLogin}><label>Username<input value={credentials.username} onChange={(event) => setCredentials({ ...credentials, username: event.target.value })} required /></label><label>Password<input type="password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} required /></label><button className="button" type="submit">Sign in</button></form>{error && <p className="form-error">{error}</p>}</section></main>;

  return <main className="container page admin-page"><header className="admin-header"><div><p className="eyebrow">CONTROL ROOM</p><h1>Admin dashboard</h1><p>Manage the platform content from one place.</p></div><button className="button secondary" onClick={() => { localStorage.removeItem("access_token"); setData(null); }}>Sign out</button></header>{error && <p className="form-error">{error}</p>}<div className="admin-stats">{["stories", "resources", "tags", "users"].map((type) => <div key={type}><strong>{data[type].length}</strong><span>{type}</span></div>)}</div><section className="admin-section"><h2>Publish a story</h2><form className="story-form" onSubmit={publishStory}><label>Title<input value={story.title} onChange={(event) => setStory({ ...story, title: event.target.value })} required /></label><label>Slug<input value={story.slug} onChange={(event) => setStory({ ...story, slug: event.target.value })} required /></label><label>Author<input value={story.author} onChange={(event) => setStory({ ...story, author: event.target.value })} required /></label><label>Category<input value={story.category} onChange={(event) => setStory({ ...story, category: event.target.value })} required /></label><div className="story-form-wide"><span className="editor-label">Story</span><RichTextEditor value={story.content} onChange={(content) => setStory({ ...story, content })} /></div><fieldset className="story-form-wide tag-picker"><legend>Story topics</legend>{data.tags.length ? data.tags.map((availableTag) => <label key={availableTag.id}><input type="checkbox" checked={selectedTags.includes(availableTag.id)} onChange={(event) => setSelectedTags(event.target.checked ? [...selectedTags, availableTag.id] : selectedTags.filter((id) => id !== availableTag.id))} />{availableTag.name}</label>) : <span>No topics yet.</span>}</fieldset><label className="story-form-wide">Cover photo<input type="file" accept="image/*" onChange={(event) => setImage(event.target.files[0] || null)} /></label><button className="button" type="submit">Publish story</button></form></section><section className="admin-section"><h2>Resources and topics</h2><div className="admin-create-row"><form onSubmit={addResource}><h3>Add resource</h3><input placeholder="Title" value={resource.title} onChange={(event) => setResource({ ...resource, title: event.target.value })} required /><input placeholder="Type" value={resource.resource_type} onChange={(event) => setResource({ ...resource, resource_type: event.target.value })} required /><input placeholder="URL" value={resource.url} onChange={(event) => setResource({ ...resource, url: event.target.value })} required /><textarea placeholder="Description" value={resource.description} onChange={(event) => setResource({ ...resource, description: event.target.value })} required /><button className="button" type="submit">Add resource</button></form><form onSubmit={addTag}><h3>Add topic</h3><input placeholder="Name" value={newTag.name} onChange={(event) => setNewTag({ ...newTag, name: event.target.value })} required /><input placeholder="Slug" value={newTag.slug} onChange={(event) => setNewTag({ ...newTag, slug: event.target.value })} required /><button className="button" type="submit">Add topic</button></form></div></section><section className="admin-section"><h2>Content inventory</h2><div className="admin-table">{["stories", "resources", "tags", "users"].map((type) => <div className="admin-row" key={type}><span><strong>{type}</strong> <small>{data[type].map((item) => item.title || item.name || item.username).join(" · ") || "No items yet"}</small></span>{type !== "users" && data[type].slice(0, 1).map((item) => <button key={item.id} className="text-link" onClick={() => deleteItem(type, item.id)}>Delete</button>)}</div>)}</div></section></main>;
}
