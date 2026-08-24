import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ChevronRight, FolderOpen, ImagePlus, Library, LogOut, Pencil, Plus, Search, Tags, Trash2, Users, X } from "lucide-react";
import RichTextEditor from "../components/RichTextEditor";
import { addStoryTags, createAdminItem, createStory, createUploadedAdminResource, deleteAdminItem, getAdminData, login, updateAdminItem, uploadAdminImage, uploadAdminResource, uploadResourceCarousel } from "../services/api";

const sections = [{ id: "stories", label: "Stories", icon: BookOpen }, { id: "resources", label: "Resources", icon: Library }, { id: "tags", label: "Topics", icon: Tags }, { id: "users", label: "People", icon: Users }];
const storyBlank = { title: "", slug: "", author: "", category: "", content: "", image_url: "", published: true, featured: false, tags: [] };
const resourceBlank = { title: "", description: "", resource_type: "", url: "", downloadable: false, published: true };
const tagBlank = { name: "", slug: "" };
const slugify = (text) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const singularLabel = (type) => ({ stories: "story", resources: "resource", tags: "topic", users: "person" }[type] || type);

export default function AdminConsole() {
  return <h1 style={{ color: "red", padding: "50px" }}>ADMIN TEST</h1>;

  const [data, setData] = useState(null);
