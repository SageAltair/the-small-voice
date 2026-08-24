# Day 6 - Content Architecture & Discovery

## Objective

Expand The Small Voice from a basic blog API
into a structured content platform.

## Features

- Stories
- Tags
- Many-to-many story/tag relationships
- Learning resources
- Resource types
- Resource filtering
- Search
- Related stories
- Content discovery

## Content Flow

Story
↓
Tags
↓
Related Stories
↓
Learning
↓
Resources
↓
Practice
↓
Growth
↓
Community
↓
Mission

## Day 6 Challenges

- [ ] Create tags
- [ ] Prevent duplicate tags
- [ ] Connect stories to tags
- [ ] Retrieve stories by tag
- [ ] Search stories
- [ ] Filter resources
- [ ] Search resources
- [ ] Build related stories
- [ ] Exclude current story from recommendations
- [ ] Limit recommendations

## Key Concepts

- Database relationships
- Many-to-many relationships
- Foreign keys
- SQLAlchemy relationships
- Search
- Filtering
- Recommendation logic
- Information architecture

## Admin Access

The backend creates an administrator on first startup. Local defaults are
`admin` / `change-admin-password`. Set these variables in `.env` before
deployment:

```env
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-a-strong-password
```

Open `/admin` in the frontend to sign in and manage stories, resources,
topics, and contributors.