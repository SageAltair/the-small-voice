/**
 * All user-facing copy for the Resources system, in English and Swahili.
 *
 * Kept in its own module (like `practiceCopy.js`) rather than growing the flat
 * `translations` object in LanguageContext, because Resources has this many
 * strings and needs to stay readable as a document. It is merged into the
 * provider as `t.resources.*` so screens read `t.resources.viewAll` rather
 * than competing with the rest of the site for top-level keys.
 *
 * The Swahili is written as Swahili rather than transliterated from the
 * English: controls say "Sikiliza" (listen) instead of a literal rendering of
 * "Listen audio", and empty states are phrased the way a reader meets them.
 */

const en = {
  // ---- page furniture -------------------------------------------------
  // `label` is the short navigation word (Navbar, Footer); the rest of this
  // object is page copy. `t.resources` is the whole object, so anything that
  // used to print the flat string must read `t.resources.label`.
  label: "Resources",
  eyebrow: "Resources",
  title: "Something worth exploring.",
  intro:
    "Reels, videos, audio, books, carousels, quotes, images, infographics and documents — collected here so you can find the one that meets you where you are.",
  browseAll: "Browse everything",
  searchPlaceholder: "Search resources",
  searchLabel: "Search resources",
  clearSearch: "Clear search",
  resultsFor: "Results for",
  noResults: "No resources matched that search.",
  noResultsHint: "Try a different word, or browse by type below.",
  allTypes: "All types",
  viewAll: "View all",
  backToResources: "Back to Resources",
  loading: "Loading…",
  loadingMore: "Loading more…",
  retry: "Try again",
  errorTitle: "Something went wrong",
  errorBody: "We could not load this just now.",
  notFoundTitle: "We could not find that",
  notFoundBody:
    "The resource may have moved, or it may never have been published.",
  exploreInstead: "Explore Resources instead",
  emptyTitle: "Nothing here yet",
  emptyBody: "There is no published content of this type just now.",
  countLabel: "{count} resources",
  showing: "Showing {from}–{to} of {total}",

  // ---- the nine types -------------------------------------------------
  types: {
    reel: "Reels",
    video: "Videos",
    audio: "Audio",
    book: "Books",
    carousel: "Carousels",
    quote: "Quotes",
    image: "Images",
    infographic: "Infographics",
    document: "Documents",
  },

  singularTypes: {
    reel: "Reel",
    video: "Video",
    audio: "Audio",
    book: "Book",
    carousel: "Carousel",
    quote: "Quote",
    image: "Image",
    infographic: "Infographic",
    document: "Document",
  },

  typeDescriptions: {
    reel: "Short vertical videos to sit with for a moment.",
    video: "Longer teaching, told and shown.",
    audio: "Listen while you walk, wash, or work.",
    book: "Read at your own pace, page by page.",
    carousel: "Swipe through a thought, slide by slide.",
    quote: "One thought worth carrying with you.",
    image: "Pictures to look at slowly.",
    infographic: "One idea, drawn clearly.",
    document: "Papers and guides to download and keep.",
  },

  // ---- badges and metadata --------------------------------------------
  featured: "Featured",
  recommended: "Recommended",
  isNew: "New",
  popular: "Popular",
  minutes: "{time} min",
  pages: "{count} pages",
  slides: "{count} slides",
  chapters: "{count} chapters",
  byAuthor: "by {author}",
  publishedOn: "Published {date}",
  languageLabel: "Language",
  topicsLabel: "Topics",
  tagsLabel: "Tags",

  // ---- actions --------------------------------------------------------
  play: "Play",
  pause: "Pause",
  mute: "Mute",
  unmute: "Unmute",
  replay: "Play again",
  fullscreen: "Fullscreen",
  exitFullscreen: "Exit fullscreen",
  download: "Download",
  share: "Share",
  shareCopied: "Link copied",
  copyLink: "Copy link",
  save: "Save",
  saved: "Saved",
  transcript: "Read the transcript",
  openExternal: "Open in a new tab",
  readMore: "Open",
  next: "Next",
  previous: "Previous",
  nextSlide: "Next slide",
  previousSlide: "Previous slide",
  of: "of",

  // ---- related --------------------------------------------------------
  relatedTitle: "Related resources",
  relatedEmpty: "Nothing related yet. Explore the rest of the library.",

  // ---- reel viewer ----------------------------------------------------
  reelHint: "Swipe or scroll for the next reel",

  // ---- video viewer ---------------------------------------------------
  videoUnavailable: "This video could not be played.",
  videoUnavailableHint: "It may still be downloadable below.",

  // ---- audio viewer ---------------------------------------------------
  audioUnavailable: "This audio could not be played.",
  speed: "Speed",
  normalSpeed: "Normal",
  nowPlaying: "Now playing",
  miniPlayer: "Audio player",
  closePlayer: "Close the player",
  openFullPlayer: "Open the full player",

  // ---- book reader ---------------------------------------------------
  bookContents: "Contents",
  bookContentsEmpty: "No chapters have been added yet.",
  chapterProgress: "Chapter {current} of {total}",
  readingProgress: "Reading progress",
  increaseText: "Larger text",
  decreaseText: "Smaller text",
  resetText: "Reset text size",
  readingMode: "Reading mode",
  lightMode: "Light",
  sepiaMode: "Warm",
  darkMode: "Dark",
  downloadBook: "Download the book",

  // ---- carousel -------------------------------------------------------
  slideCounter: "Slide {current} of {total}",
  carouselHint: "Use the arrow keys, or swipe on a phone.",

  // ---- quote ----------------------------------------------------------
  quoteByline: "— {author}",

  // ---- image viewer ---------------------------------------------------
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetZoom: "Reset zoom",
  imageCounter: "Image {current} of {total}",
  fitToScreen: "Fit to screen",

  // ---- document viewer ------------------------------------------------
  documentSearch: "Search inside this document",
  documentSearchPlaceholder: "Type a word or phrase",
  documentSearchResults: "{count} matches",
  documentSearchNoResults: "No matches in this document",
  documentPage: "Page {current} of {total}",
  documentCannotPreview: "This document cannot be shown here",
  documentCannotPreviewHint: "Open or download it to read it in full.",
  openDocument: "Open document",
  documentPageLoading: "Loading page…",

  // ---- filters and sorting --------------------------------------------
  filterByType: "Filter by type",
  filterByTopic: "Filter by topic",
  sortBy: "Sort by",
  sortRecommended: "Recommended",
  sortNewest: "Newest",
  sortOldest: "Oldest",
  sortPopular: "Most viewed",
  sortTitle: "A – Z",

  // ---- admin ---------------------------------------------------------
  // The managing interface is translated too. An administrator who works in
  // Kiswahili should not have to read English to correct a typo in a caption.
  admin: {
    title: "Resources",
    subtitle: "Manage every resource in the library.",
    backToLibrary: "Back to library",
    signOut: "Sign out",

    tabDashboard: "Dashboard",
    tabLibrary: "Library",
    tabNew: "New resource",

    // dashboard
    statTotal: "Total",
    statPublished: "Published",
    statDraft: "Drafts",
    statScheduled: "Scheduled",
    statFeatured: "Featured",
    statTrashed: "In trash",
    byType: "By type",
    needsAttention: "Needs attention",
    recentlyUpdated: "Recently updated",
    nothingYet: "Nothing has been created yet.",
    editResource: "Edit {title}",

    // list
    search: "Search resources",
    searchPlaceholder: "Title, topic or tag…",
    allStatuses: "All statuses",
    allTypes: "All types",
    sortUpdated: "Recently updated",
    sortNewest: "Newest",
    sortTitle: "Title",
    sortStatus: "Status",
    sortPopular: "Most viewed",
    refresh: "Refresh the list",
    selectResource: "Select {title}",
    trash: "Trash",
    liveLibrary: "Library",
    columns: {
      title: "Title",
      type: "Type",
      status: "Status",
      updated: "Updated",
      actions: "Actions",
    },
    emptyLibrary: "No resources match these filters.",
    emptyTrash: "The trash is empty.",
    selectAll: "Select all on this page",
    selected: "{count} selected",
    clearSelection: "Clear selection",
    bulkActions: "Actions for {count} selected",
    bulkPublish: "Publish",
    bulkUnpublish: "Unpublish",
    bulkFeature: "Feature",
    bulkUnfeature: "Remove feature",
    bulkTrash: "Move to trash",
    bulkRestore: "Restore",

    // statuses
    status: {
      draft: "Draft",
      published: "Published",
      scheduled: "Scheduled",
      archived: "Archived",
    },
    statusPublishAt: "Goes live {when}",
    statusTrashed: "In trash",

    // row actions
    edit: "Edit",
    publish: "Publish",
    unpublish: "Unpublish",
    duplicate: "Duplicate",
    schedule: "Schedule",
    unschedule: "Cancel schedule",
    preview: "Preview",
    moveToTrash: "Move to trash",
    restore: "Restore",
    deleteForever: "Delete permanently",

    // confirmations
    confirmPublishTitle: "Publish this resource?",
    confirmPublishBody:
      "It becomes visible to visitors on the public site straight away.",
    confirmUnpublishTitle: "Unpublish this resource?",
    confirmUnpublishBody:
      "It disappears from the public site. Nothing is deleted and you can publish it again at any time.",
    confirmTrashTitle: "Move to trash?",
    confirmTrashBody:
      "It is hidden from the public site and can be restored from the trash.",
    confirmRestoreTitle: "Restore this resource?",
    confirmRestoreBody:
      "It returns to the library in the state it was in before it was trashed.",
    confirmDeleteTitle: "Delete permanently?",
    confirmDeleteBody:
      "This cannot be undone. The resource and its uploaded files are removed for good.",
    confirmDuplicateTitle: "Duplicate this resource?",
    confirmDuplicateBody:
      "A copy is created as a draft. The original is left untouched.",
    confirmBulkTitle: "Apply to {count} resources?",
    confirmBulkBody: "This action is applied to every selected resource.",
    confirm: "Yes, continue",
    cancelAction: "Cancel",

    // scheduling
    scheduleTitle: "Schedule when this goes live",
    scheduleHint: "Leave empty to publish immediately instead of waiting.",
    scheduleAt: "Publish on",
    scheduleDone: "Scheduled for {when}",

    // editor
    editorNew: "New resource",
    editorEdit: "Edit resource",
    sectionType: "Type",
    sectionDetails: "Details",
    sectionTranslations: "Other languages",
    sectionFiles: "{type} files",
    sectionPublishing: "Publishing",
    sectionCuration: "Curation",
    sectionLinks: "Related content",
    sectionSlides: "Slides",
    sectionChapters: "Chapters",

    fieldTitle: "Title",
    fieldDescription: "Description",
    fieldExcerpt: "Short summary",
    fieldExcerptHint: "shown on cards",
    fieldAuthor: "Author",
    fieldTopic: "Topic",
    fieldTags: "Tags",
    fieldTagsHint: "comma separated",
    fieldSlug: "URL slug",
    fieldSlugHint: "blank uses the title",
    fieldLanguage: "Language",
    fieldVisibility: "Visibility",
    fieldDownload: "Allow downloads",
    fieldDisplayOrder: "Display order",
    fieldDuration: "Duration",
    fieldDurationHint: "seconds",
    fieldPages: "Pages",
    fieldPagesHint: "blank reads it from the file",
    fieldAltText: "Alt text",
    fieldAltTextHint: "describe it for screen readers",
    fieldCaption: "Caption",
    fieldQuoteText: "The quote",
    fieldAttribution: "Author or source",
    fieldTranscript: "Transcript",
    fieldExternalUrl: "Or link an external video",
    fieldExternalUrlHint: "YouTube, Vimeo…",
    fieldDescriptionAlt: "Long description",

    languageName: { en: "English", sw: "Kiswahili" },
    translationHint: "Leave a language blank to fall back to the English text.",

    yes: "Yes",
    no: "No",
    visibilityPublic: "Public",
    visibilityUnlisted: "Unlisted",
    visibilityPrivate: "Private",
    downloadOffHint: "off by default",

    checkShare: "Allow sharing",
    checkSave: "Allow saving",
    checkHomepage: "Show on the Resources homepage",
    checkFeatured: "Featured",
    checkRecommended: "Recommended",
    checkNew: "New",
    curationHint:
      "These decide where the resource appears on the public homepage.",

    // type-specific field labels
    mediaFile: "Media file",
    coverImage: "Cover image",
    backgroundImage: "Background image",
    backgroundImageHint: "Optional — used behind the quote",
    thumbnail: "Thumbnail / cover",
    infographicFile: "Infographic image or PDF",
    imageFile: "Image",
    bookFile: "Book or PDF file",
    documentFile: "Document file",

    // slides
    slideAdd: "Add slide",
    slideRemove: "Remove slide",
    slideMoveUp: "Move up",
    slideMoveDown: "Move down",
    slideNumber: "Slide {number}",
    slideImage: "Slide image",
    slideText: "Text",
    slideCaption: "Caption",
    slideAlt: "Alt text",
    slideAltHint: "describe it for screen readers",
    slideEmpty: "Add at least two slides for a carousel.",

    // chapters
    chapterAdd: "Add chapter",
    chapterRemove: "Remove chapter",
    chapterMoveUp: "Move up",
    chapterMoveDown: "Move down",
    chapterNumber: "Chapter {number}",
    chapterTitle: "Title",
    chapterFile: "Chapter file",
    chapterBody: "Chapter text",
    chapterPages: "Pages",
    chapterEmpty: "Add chapters to give the reader a contents list.",

    // relationships
    linkAdd: "Link content",
    linkRemove: "Unlink",
    linkSearch: "Search stories, learning and resources",
    linkSearchPlaceholder: "Type to search…",
    linkKind: { story: "Story", learning: "Learning", resource: "Resource" },
    linkNone: "Nothing linked yet.",
    linkSearchNone: "Nothing matched that search.",
    linkSearchHint: "Search across stories, learning paths and other resources.",

    // uploader
    chooseFile: "Choose a file from this device",
    sizeLimit: "Up to 300 MB",
    uploadedFile: "Uploaded file",
    replaceFile: "Replace the file",
    removeFile: "Remove the file",
    fileUrl: "{label} URL",
    uploading: "Uploading {name}",
    retry: "Retry",
    fileEmpty: "That file is empty.",
    fileTooLarge: "That file is {size}. The limit is 300 MB.",
    uploadFailed: "The upload failed.",
    pagesShort: "{count} pages",

    // editor actions and validation
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    close: "Close",
    beforePublishing: "Before publishing:",
    created: "Resource created.",
    saved: "Changes saved.",
    published: "Resource published.",
    unpublished: "Resource unpublished.",
    scheduled: "Resource scheduled.",
    unscheduled: "Schedule cancelled.",
    duplicated: "Duplicated as a draft.",
    trashed: "Moved to trash.",
    restored: "Restored.",
    deleted: "Deleted permanently.",
    bulkDone: "{count} resources updated.",
    actionDone: "Done.",
    previewTitle: "Preview",
    previewNote:
      "This is the public viewer. Drafts and private resources are never shown publicly, so a preview is the only way to see them before publishing.",
    previewEmpty: "Save the resource first to preview it.",
    unknownStatus: "Unknown status",
  },
};

const sw = {
  // ---- page furniture -------------------------------------------------
  label: "Rasilimali",
  eyebrow: "Rasilimali",
  title: "Kitu cha kuvutia.",
  intro:
    "Vipindi, vidio, sauti, vitabu, slaidi, manukuu, picha, taarifa na waraka — vyote vimewekwa hapa ili upate kile unachohitaji.",
  browseAll: "Ona zote",
  searchPlaceholder: "Tafuta rasilimali",
  searchLabel: "Tafuta rasilimali",
  clearSearch: "Futa utafutaji",
  resultsFor: "Matokeo ya",
  noResults: "Hakuna rasilimali zilizopatikana kwa utafutaji huo.",
  noResultsHint: "Jaribu neno lingine, au chuja kwa aina hapa chini.",
  allTypes: "Aina zote",
  viewAll: "Ona zote",
  backToResources: "Rudi kwenye Rasilimali",
  loading: "Inapakia…",
  loadingMore: "Inapakia zaidi…",
  retry: "Jaribu tena",
  errorTitle: "Hitilafu imetokea",
  errorBody: "Hatukuweza kupakia hivi sasa.",
  notFoundTitle: "Hatukupata kile ulichotafuta",
  notFoundBody: "Rasilimali huenda imehamishwa, au haikuwepo kamwe.",
  exploreInstead: "Endelea kwenye Rasilimali",
  emptyTitle: "Hakuna kitu hapa bado",
  emptyBody: "Hakuna maudhui ya aina hii yaliyochapishwa kwa sasa.",
  countLabel: "Rasilimali {count}",
  showing: "Inaonyesha {from}–{to} kati ya {total}",

  // ---- the nine types -------------------------------------------------
  types: {
    reel: "Vipindi",
    video: "Vidio",
    audio: "Sauti",
    book: "Vitabu",
    carousel: "Slaidi",
    quote: "Manukuu",
    image: "Picha",
    infographic: "Taarifa",
    document: "Waraka",
  },

  singularTypes: {
    reel: "Kipindi",
    video: "Video",
    audio: "Sauti",
    book: "Kitabu",
    carousel: "Slaidi",
    quote: "Manukuu",
    image: "Picha",
    infographic: "Taarifa",
    document: "Waraka",
  },

  typeDescriptions: {
    reel: "Vipindi mafupi ya wima.",
    video: "Mafundisho marefu, yaliyosimuliwa na kuonyeshwa.",
    audio: "Sikiliza unapotembea au unapofanya kazi.",
    book: "Soma kwa kasi yako, ukurasa moja kwa moja.",
    carousel: "Sogeza kidole kupitia wazo, slaidi kwa slaidi.",
    quote: "Wazo moja la kubeba nawe.",
    image: "Picha za kutazama kwa utulivu.",
    infographic: "Wazo moja, iliyochorwa kwa uwazi.",
    document: "Waraka na miongozo ya kushusha na kuhifadhi.",
  },

  // ---- badges and metadata --------------------------------------------

  // ---- badges and metadata --------------------------------------------
  featured: "Imeonyeshwa",
  recommended: "Imependekezwa",
  isNew: "Mpya",
  popular: "Maarufu",
  minutes: "dakika {time}",
  pages: "kurasa {count}",
  slides: "slaidi {count}",
  chapters: "surasi {count}",
  byAuthor: "na {author}",
  publishedOn: "Ilichapishwa {date}",
  languageLabel: "Lugha",
  topicsLabel: "Mada",
  tagsLabel: "Nyambo",

  // ---- actions --------------------------------------------------------
  play: "Cheza",
  pause: "Simamisha",
  mute: "Ziba sauti",
  unmute: "Rudisha sauti",
  replay: "Cheza tena",
  fullscreen: "Skrini kamili",
  exitFullscreen: "Ondoka kwenye skrini kamili",
  download: "Pakua",
  share: "Shiriki",
  shareCopied: "Kiungo kime nakiliwa",
  copyLink: "Nakili kiungo",
  save: "Hifadhi",
  saved: "Imehifadhiwa",
  transcript: "Soma maandishi",
  openExternal: "Fungua katika dirisha jipya",
  readMore: "Fungua",
  next: "Endelea",
  previous: "Rudi",
  nextSlide: "Slaidi inayofuata",
  previousSlide: "Slaidi iliyotangulia",
  of: "kati ya",

  // ---- related --------------------------------------------------------
  relatedTitle: "Rasilimali zinazohusiana",
  relatedEmpty: "Hakuna kilichohusiana bodo. Chunguza maktaba mengine.",

  // ---- reel viewer ----------------------------------------------------
  reelHint: "Sogeza kidole kupita kipindi kingine",

  // ---- video viewer ---------------------------------------------------
  videoUnavailable: "Video hii haikuweza kucheza.",
  videoUnavailableHint: "Bado unaweza kui pakua hapa chini.",

  // ---- audio viewer ---------------------------------------------------
  audioUnavailable: "Sauti hii haikuweza kucheza.",
  speed: "Kasi",
  normalSpeed: "Kawaida",
  nowPlaying: "Inaendelea kucheza",
  miniPlayer: "Kicheza sauti",
  closePlayer: "Funga kicheza",
  openFullPlayer: "Fungua kicheza kamili",

  // ---- book reader ---------------------------------------------------
  bookContents: "Yaliyomo",
  bookContentsEmpty: "Hakuna surasi bado zimeongezwa.",
  chapterProgress: "Surasi {current} kati ya {total}",
  readingProgress: "Maendeleo ya kusoma",
  increaseText: "Maandishi makubwa",
  decreaseText: "Maandishi madogo",
  resetText: "Weka maandishi upya",
  readingMode: "Hali ya kusoma",
  lightMode: "Nyepali",
  sepiaMode: "Joto",
  darkMode: "Giza",
  downloadBook: "Pakua kitabu",

  // ---- carousel -------------------------------------------------------
  slideCounter: "Slaidi {current} kati ya {total}",
  carouselHint: "Tumia vishale vya mishale, au sogeza kidole kwenye simu.",

  // ---- quote ----------------------------------------------------------
  quoteByline: "— {author}",

  // ---- image viewer ---------------------------------------------------
  zoomIn: "Kuliza",
  zoomOut: "Punguza",
  resetZoom: "Weka upya",
  imageCounter: "Picha {current} kati ya {total}",
  fitToScreen: "Kwa skrini",

  // ---- document viewer ------------------------------------------------
  documentSearch: "Tafuta ndani ya waraka huu",
  documentSearchPlaceholder: "Andika neno au maneno",
  documentSearchResults: "Matokeo {count}",
  documentSearchNoResults: "Hakuna matokeo katika waraka haya",
  documentPage: "Ukurasa {current} kati ya {total}",
  documentCannotPreview: "Waraka haya hayawezi kuonyeshwa hapa",
  documentCannotPreviewHint: "Fungua au pakua ili kuusoma kamili.",
  openDocument: "Fungua waraka",
  documentPageLoading: "Inapakia ukurasa…",

  // ---- filters and sorting --------------------------------------------
  filterByType: "Chuja kwa aina",
  filterByTopic: "Chuja kwa mada",
  sortBy: "Panga kwa",
  sortRecommended: "Zilizopendekezwa",
  sortNewest: "Mpya zaidi",
  sortOldest: "Kongwe zaidi",
  sortPopular: "Zilizoonekana zaidi",
  sortTitle: "A – Z",

  // ---- admin ---------------------------------------------------------
  admin: {
    title: "Rasilimali",
    subtitle: "Simba rasilimali zote kwenye maktaba.",
    backToLibrary: "Rudi kwenye maktaba",
    signOut: "Toka",

    tabDashboard: "Dashibodi",
    tabLibrary: "Maktaba",
    tabNew: "Rasilimali mpya",

    // dashibodi
    statTotal: "Jumla",
    statPublished: "Zilizochapishwa",
    statDraft: "Mchoro",
    statScheduled: "Zilizopangwa",
    statFeatured: "Zilizochaguliwa",
    statTrashed: "Zilizofutwa",
    byType: "Kwa aina",
    needsAttention: "Zinahitaji kushughulikiwa",
    recentlyUpdated: "Zilizosasishwa hivi karibuni",
    nothingYet: "Hakuna kilichoundwa bado.",
    editResource: "Hariri {title}",

    // orodha
    search: "Tafuta rasilimali",
    searchPlaceholder: "Jina, mada au lebo…",
    allStatuses: "Hali zote",
    allTypes: "Aina zote",
    sortUpdated: "Ilisasishwa hivi karibuni",
    sortNewest: "Mpya zaidi",
    sortTitle: "Jina",
    sortStatus: "Hali",
    sortPopular: "Zilizoonekana zaidi",
    refresh: "Onyesha upya orodha",
    selectResource: "Chagua {title}",
    trash: "Taka",
    liveLibrary: "Maktaba",
    columns: {
      title: "Jina",
      type: "Aina",
      status: "Hali",
      updated: "Ilisasishwa",
      actions: "Hatua",
    },
    emptyLibrary: "Hakuna rasilimali inayolingana na vichujio hivi.",
    emptyTrash: "Taka ni tupu.",
    selectAll: "Chagua zote ukurasa huu",
    selected: "{count} zimechaguliwa",
    clearSelection: "Futa uchaguzi",
    bulkActions: "Hatua kwa {count} zilizochaguliwa",
    bulkPublish: "Chapisha",
    bulkUnpublish: "Acha kuchapisha",
    bulkFeature: "Chagua",
    bulkUnfeature: "Ondoa uchaguzi",
    bulkTrash: "Sogeza kwenye taka",
    bulkRestore: "Rejesha",

    // hali
    status: {
      draft: "Mchoro",
      published: "Imechapishwa",
      scheduled: "Imepangwa",
      archived: "Imehifadhiwa",
    },
    statusPublishAt: "Inaonekana {when}",
    statusTrashed: "Kwenye taka",

    // hatua za kila safu
    edit: "Hariri",
    publish: "Chapisha",
    unpublish: "Acha kuchapisha",
    duplicate: "Nakili",
    schedule: "Panga",
    unschedule: "Ghairi ratiba",
    preview: "Hakiki",
    moveToTrash: "Sogeza kwenye taka",
    restore: "Rejesha",
    deleteForever: "Futa kwa muda",

    // uthibitisho
    confirmPublishTitle: "Chapisha rasilimali hii?",
    confirmPublishBody:
      "Itatokea kwa wageni tovuti moja kwa moja.",
    confirmUnpublishTitle: "Acha kuchapisha rasilimali hii?",
    confirmUnpublishBody:
      "Itatoweka kwenye tovuti ya umma. Hakuna kinachofutwa na unaweza kuichapisha tena wakati wowote.",
    confirmTrashTitle: "Isogeze kwenye taka?",
    confirmTrashBody:
      "Itafichwa kwenye tovuti ya umma na unaweza kuijirudisha kutoka kwenye taka.",
    confirmRestoreTitle: "Rejesha rasilimali hii?",
    confirmRestoreBody:
      "Itarudi kwenye maktaba katika hali iliyokuwa kabla ya kufutwa.",
    confirmDeleteTitle: "Futa kwa muda?",
    confirmDeleteBody:
      "Kitendo hiki hakiwezi kutenduliwa. Rasilimali na mafaili yake yatafutwa kabisa.",
    confirmDuplicateTitle: "Nakili rasilimali hii?",
    confirmDuplicateBody:
      "Nakala hutengenezwa kama mchoro. Asili hubaki bila kubadilika.",
    confirmBulkTitle: "Tumia kwa rasilimali {count}?",
    confirmBulkBody: "Kitendo hiki kitatumiwa kwa kila rasilimali iliyochaguliwa.",
    confirm: "Ndiyo, endelea",
    cancelAction: "Ghairi",

    // ratiba
    scheduleTitle: "Panga wakati itakapochapishwa",
    scheduleHint: "Acha tupu ili kuchapisha mara moja badala ya kusubiri.",
    scheduleAt: "Chapisha tarehe",
    scheduleDone: "Imepangwa {when}",

    // mhariri
    editorNew: "Rasilimali mpya",
    editorEdit: "Hariri rasilimali",
    sectionType: "Aina",
    sectionDetails: "Maelezo",
    sectionTranslations: "Lugha nyingine",
    sectionFiles: "Faili za {type}",
    sectionPublishing: "Uchapishaji",
    sectionCuration: "Uchaguzi",
    sectionLinks: "Yaliyomo yanayohusiana",
    sectionSlides: "Slaidi",
    sectionChapters: "Sura",

    fieldTitle: "Jina",
    fieldDescription: "Maelezo",
    fieldExcerpt: "Muhtasari mfupi",
    fieldExcerptHint: "huo kwenye kadi",
    fieldAuthor: "Mwandishi",
    fieldTopic: "Mada",
    fieldTags: "Lebo",
    fieldTagsHint: "zikilizwa kwa koma",
    fieldSlug: "Kiole cha URL",
    fieldSlugHint: "tupu hutumia jina",
    fieldLanguage: "Lugha",
    fieldVisibility: "Mwonekano",
    fieldDownload: "Ruhusu vikurushi",
    fieldDisplayOrder: "Orodha ya mpangilio",
    fieldDuration: "Muda",
    fieldDurationHint: "sekunde",
    fieldPages: "Kurasa",
    fieldPagesHint: "tupu husoma kutoka kwenye faili",
    fieldAltText: "Maandishi mbadala",
    fieldAltTextHint: "eleza kwa wasoma skrini",
    fieldCaption: "Kichwa",
    fieldQuoteText: "Manukuu",
    fieldAttribution: "Mwandishi au chanzo",
    fieldTranscript: "Andika la mazungumzo",
    fieldExternalUrl: "Auunganisha video ya nje",
    fieldExternalUrlHint: "YouTube, Vimeo…",
    fieldDescriptionAlt: "Maelezo marefu",

    languageName: { en: "Kiingereza", sw: "Kiswahili" },
    translationHint: "Acha lugha tupu ili kutumia maandishi ya Kiingereza.",

    yes: "Ndiyo",
    no: "Hapana",
    visibilityPublic: "Umma",
    visibilityUnlisted: "Haipo kwenye orodha",
    visibilityPrivate: "Binafsi",
    downloadOffHint: "imezwawa kwa default",

    checkShare: "Ruhusu kushiriki",
    checkSave: "Ruhusu kuhifadhi",
    checkHomepage: "Onyesha kwenye ukurasa wa Rasilimali",
    checkFeatured: "Imechaguliwa",
    checkRecommended: "Imependekezwa",
    checkNew: "Mpya",
    curationHint:
      "Hizi huamua mahali rasilimali itaonekana kwenye ukurasa wa umma.",

    // majina ya faili kwa kila aina
    mediaFile: "Faili ya sauti/video",
    coverImage: "Picha ya jalada",
    backgroundImage: "Picha ya nyuma",
    backgroundImageHint: "Si lazima — inatumika nyuma ya manukuu",
    thumbnail: "Picha ndogo / jalada",
    infographicFile: "Picha au PDF ya taarifa",
    imageFile: "Picha",
    bookFile: "Kitabu au PDF",
    documentFile: "Faili ya waraka",

    // slaidi
    slideAdd: "Ongeza slaidi",
    slideRemove: "Ondoa slaidi",
    slideMoveUp: "Sogeza juu",
    slideMoveDown: "Sogeza chini",
    slideNumber: "Slaidi {number}",
    slideImage: "Picha ya slaidi",
    slideText: "Maandishi",
    slideCaption: "Kichwa",
    slideAlt: "Maandishi mbadala",
    slideAltHint: "eleza kwa wasoma skrini",
    slideEmpty: "Ongeza angalau slaidi mbili kwa carousel.",

    // sura
    chapterAdd: "Ongeza sura",
    chapterRemove: "Ondoa sura",
    chapterMoveUp: "Sogeza juu",
    chapterMoveDown: "Sogeza chini",
    chapterNumber: "Sura {number}",
    chapterTitle: "Jina",
    chapterFile: "Faili ya sura",
    chapterBody: "Maandishi ya sura",
    chapterPages: "Kurasa",
    chapterEmpty: "Ongeza sura ili msomaji apate orodha ya yaliyomo.",

    // uhusiano
    linkAdd: "Unganisha yaliyomo",
    linkRemove: "Kata muhusiano",
    linkSearch: "Tafuta hadithi, kujifunza na rasilimali",
    linkSearchPlaceholder: "Andika ili kutafuta…",
    linkKind: { story: "Hadithi", learning: "Kujifunza", resource: "Rasilimali" },
    linkNone: "Hakuna kilichounganishwa bado.",
    linkSearchNone: "Hakuna kilicholingana na utafutaji huo.",
    linkSearchHint: "Tafuta kati ya hadithi, njia za kujifunza na rasilimali nyingine.",

    // kupakia
    chooseFile: "Chagua faili kutoka kwenye kifaa hiki",
    sizeLimit: "Hadi 300 MB",
    uploadedFile: "Faili iliyopakiwa",
    replaceFile: "Badilisha faili",
    removeFile: "Ondoa faili",
    fileUrl: "URL ya {label}",
    uploading: "Inapakia {name}",
    retry: "Jaribu tena",
    fileEmpty: "Faili hiyo ni tupu.",
    fileTooLarge: "Faili hiyo ni {size}. Kikomo cha juu ni 300 MB.",
    uploadFailed: "Upakiaji umeshindwa.",
    pagesShort: "kurasa {count}",

    // hatua za mhariri na uhakiki
    save: "Hifadhi",
    saving: "Inahifadhi…",
    cancel: "Ghairi",
    close: "Funga",
    beforePublishing: "Kabla ya kuchapisha:",
    created: "Rasilimali imetengenezwa.",
    saved: "Mabadiliko yamehifadhiwa.",
    published: "Rasilimali imechapishwa.",
    unpublished: "Rasilimali imeacha kuchapishwa.",
    scheduled: "Rasilimali imepangwa.",
    unscheduled: "Ratiba imeghairiwa.",
    duplicated: "Imenakiliwa kama mchoro.",
    trashed: "Imesogezwa kwenye taka.",
    restored: "Imejirudishwa.",
    deleted: "Imefutwa kwa muda.",
    bulkDone: "Rasilimali {count} zimesasishwa.",
    actionDone: "Imekamilika.",
    previewTitle: "Hakiki",
    previewNote:
      "Hii ndio mtazamo wa umma. Michoro na rasilimali za binafsi hazionyeshwi kwa umma, kwa hivyo hakiki ndiyo njia pekee ya kuona kabla ya kuchapisha.",
    previewEmpty: "Hifadhi rasilimali kwanza ili kuihakiki.",
    unknownStatus: "Hali isiyojulikana",
  },
};

export const resourcesCopy = { en, sw };

/**
 * Substitute `{placeholders}` in a copy string.
 *
 * Kept next to the copy rather than in the language provider because the
 * Resources screens use it heavily ("12 min", "Slide 2 of 5") and threading a
 * formatter through the provider for one feature would be the wrong home.
 */
export function fill(template, values = {}) {
  if (!template) return "";
  return String(template).replace(
    /\{(\w+)\}/g,
    (match, key) =>
      values[key] === undefined || values[key] === null
        ? match
        : String(values[key]),
  );
}

export default resourcesCopy;
