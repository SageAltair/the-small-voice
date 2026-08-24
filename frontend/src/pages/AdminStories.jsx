import { useEffect, useState } from "react";

import { Link } from "react-router-dom";

import RichTextEditor from "../components/RichTextEditor";
import { getAdminData, updateAdminItem } from "../services/api";


export default function AdminStories() {
  const [stories, setStories] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  async function loadStories() {
    try {
      const data = await getAdminData();
      setStories(data.stories);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    getAdminData()
      .then((data) => setStories(data.stories))
      .catch((err) => setError(err.message));
  }, []);

  async function saveStory(event) {
    event.preventDefault();
    try {
      await updateAdminItem("stories", editing.id, {
        title: editing.title,
        slug: editing.slug,
        author: editing.author,
        category: editing.category,
        content: editing.content,
        published: editing.published,
      });
      setEditing(null);
      await loadStories();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="container page admin-page">
      <header className="admin-header">
        <div>
          <p className="eyebrow">CONTENT MANAGEMENT</p>
          <h1>All stories</h1>
          <p>Review and update every story in the publication.</p>
          <Link className="button secondary" to="/admin/dashboard">Open admin dashboard</Link>
        </div>
      </header>

      {error && <p className="form-error">{error}</p>}

      {editing && (
        <section className="admin-section">
          <h2>Edit story</h2>
          <form className="story-form" onSubmit={saveStory}>
            <label>Title<input value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} required /></label>
            <label>Slug<input value={editing.slug} onChange={(event) => setEditing({ ...editing, slug: event.target.value })} required /></label>
            <label>Author<input value={editing.author} onChange={(event) => setEditing({ ...editing, author: event.target.value })} required /></label>
            <label>Category<input value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })} required /></label>
            <div className="story-form-wide"><span className="editor-label">Story</span><RichTextEditor value={editing.content} onChange={(content) => setEditing({ ...editing, content })} /></div>
            <label className="publish-toggle"><input type="checkbox" checked={editing.published} onChange={(event) => setEditing({ ...editing, published: event.target.checked })} /> Published</label>
            <div className="admin-actions"><button className="button" type="submit">Save changes</button><button className="button secondary" type="button" onClick={() => setEditing(null)}>Cancel</button></div>
          </form>
        </section>
      )}

      <section className="admin-section">
        <div className="admin-section-heading"><h2>Story list</h2><span>{stories.length} total</span></div>
        <div className="story-admin-table">
          {stories.map((story) => (
            <article className="story-admin-row" key={story.id}>
              <div><strong>{story.title}</strong><span>{story.author} · {story.category}</span><small>{story.published ? "Published" : "Draft"} · {story.tags?.length || 0} topics</small></div>
              <button className="text-link" type="button" onClick={() => setEditing({ ...story })}>Edit story</button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}