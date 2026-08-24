import { useState } from "react";
import { Search, X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";


export default function SearchBar({
  onSearch,
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");


  function handleSubmit(event) {
    event.preventDefault();

    onSearch(query.trim());
  }


  function handleClear() {
    setQuery("");

    onSearch("");
  }


  return (
    <form
      className="search-form"
      onSubmit={handleSubmit}
    >
      <input
        type="search"
        value={query}
        onChange={(event) =>
          setQuery(event.target.value)
        }
        placeholder={`${t.searchStories}...`}
        aria-label={t.searchStories}
      />

      <button type="submit">
        <Search size={16} aria-hidden="true" />
        <span>{t.search}</span>
      </button>

      {query && (
        <button
          type="button"
          onClick={handleClear}
        >
          <X size={15} aria-hidden="true" />
          <span>{t.clear}</span>
        </button>
      )}
    </form>
  );
}
