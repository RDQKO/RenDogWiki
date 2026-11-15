CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE users (id serial PRIMARY KEY, username varchar(64) UNIQUE NOT NULL, email varchar(254) UNIQUE NOT NULL,
  minecraft_name varchar(16) UNIQUE NOT NULL, password_hash text NOT NULL DEFAULT '', verified boolean DEFAULT true,
  verification_token text, role text DEFAULT 'guest', created_at timestamp DEFAULT now());
CREATE TABLE categories (id serial PRIMARY KEY, name text NOT NULL, parent_id int, "order" int DEFAULT 0,
  document_id int, icon text, mode_tags text[] DEFAULT '{}', uploader text);
CREATE TABLE documents (id serial PRIMARY KEY, title varchar(255) NOT NULL, path varchar(255) NOT NULL,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(), icon text, tags text,
  is_featured boolean DEFAULT false, special text, uploader text, "order" int DEFAULT 0);
CREATE TABLE document_contents (id serial PRIMARY KEY, document_id int UNIQUE NOT NULL, content text);
CREATE TABLE document_search_sections (id bigserial PRIMARY KEY, document_id int NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  section_order int NOT NULL, heading_text text DEFAULT '', heading_compact text DEFAULT '', dom_id text DEFAULT '',
  level smallint DEFAULT 0, plain_text text DEFAULT '', compact_text text DEFAULT '', updated_at timestamptz DEFAULT now(),
  UNIQUE(document_id,section_order));
CREATE TABLE document_view_recent (document_id int, visitor_id text, last_viewed_at timestamptz DEFAULT now(), PRIMARY KEY(document_id,visitor_id));
CREATE TABLE document_stats_total (document_id int PRIMARY KEY, views bigint DEFAULT 0, category_views bigint DEFAULT 0,
  search_views bigint DEFAULT 0, link_views bigint DEFAULT 0, other_views bigint DEFAULT 0, updated_at timestamptz DEFAULT now());
CREATE TABLE document_stats_daily (LIKE document_stats_total INCLUDING DEFAULTS);
ALTER TABLE document_stats_daily ADD COLUMN day date DEFAULT CURRENT_DATE;
ALTER TABLE document_stats_daily ADD PRIMARY KEY(day,document_id);
CREATE TABLE faq_questions (id serial PRIMARY KEY, title text, content text, tags text[], uploader text,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now());
CREATE TABLE faq_stats_total (faq_id int PRIMARY KEY, views bigint DEFAULT 0, list_views bigint DEFAULT 0,
  search_views bigint DEFAULT 0, home_views bigint DEFAULT 0, other_views bigint DEFAULT 0, updated_at timestamptz DEFAULT now());
CREATE TABLE faq_stats_daily (LIKE faq_stats_total INCLUDING DEFAULTS);
ALTER TABLE faq_stats_daily ADD COLUMN day date DEFAULT CURRENT_DATE;
ALTER TABLE faq_stats_daily ADD PRIMARY KEY(day,faq_id);
CREATE TABLE faq_view_recent (faq_id int, visitor_id text, last_viewed_at timestamptz DEFAULT now(), PRIMARY KEY(faq_id,visitor_id));
CREATE TABLE village (id serial PRIMARY KEY, name text UNIQUE NOT NULL, icon text, "order" int DEFAULT 0, head_icon text, uploader text);
CREATE TABLE npc (id serial PRIMARY KEY, name text, icon text, location_x int DEFAULT 0, location_y int DEFAULT 0, location_z int DEFAULT 0,
  line text, village_id int REFERENCES village(id) ON DELETE CASCADE, "order" int DEFAULT 0, requirement text, quest text DEFAULT '',
  npc_type text DEFAULT 'normal', pictures jsonb DEFAULT '[]', rewards jsonb DEFAULT '[]', tag text, uploader text);
CREATE TABLE head_finder (id serial PRIMARY KEY, village_id int REFERENCES village(id) ON DELETE CASCADE, "order" int DEFAULT 0,
  location_x int DEFAULT 0, location_y int DEFAULT 0, location_z int DEFAULT 0, pictures jsonb DEFAULT '[]', uploader text, UNIQUE(village_id,"order"));
CREATE TABLE image_folders (id serial PRIMARY KEY, name text, parent_id int, uploader text);
CREATE TABLE images (id serial PRIMARY KEY, name text, url text, s3_key text, folder_id int, uploader text, mime_type text);
CREATE TABLE chat_messages (id serial PRIMARY KEY, user_id int REFERENCES users(id), text text, reply_to_id int REFERENCES chat_messages(id),
  liked_by int[] DEFAULT '{}', disliked_by int[] DEFAULT '{}', created_at timestamptz DEFAULT now(), deleted_at timestamptz);
CREATE TABLE price_items (id bigserial PRIMARY KEY, name text, name_key text, mode text, prices text[], updated_at timestamptz DEFAULT now());
CREATE TABLE activity_logs (id bigserial PRIMARY KEY, action text, username text, target_type text, target_id text,
  target_name text, target_path text, meta jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE visitor_logs (id bigserial PRIMARY KEY, ip text, created_at timestamptz DEFAULT now());
CREATE TABLE search_keyword_commits (session_id text PRIMARY KEY, keyword_key text, created_at timestamptz DEFAULT now());
CREATE TABLE search_keyword_stats_total (keyword_key text PRIMARY KEY, keyword text, searches bigint DEFAULT 0,
  document_searches bigint DEFAULT 0, faq_searches bigint DEFAULT 0, quest_searches bigint DEFAULT 0, updated_at timestamptz DEFAULT now());
CREATE TABLE search_keyword_stats_daily (LIKE search_keyword_stats_total INCLUDING DEFAULTS);
ALTER TABLE search_keyword_stats_daily ADD COLUMN day date DEFAULT CURRENT_DATE;
ALTER TABLE search_keyword_stats_daily ADD PRIMARY KEY(day,keyword_key);
INSERT INTO users (id,username,email,minecraft_name,role) VALUES
  (1,'writer','writer@example.test','Writer','writer'), (2,'other','other@example.test','Other','writer'),
  (3,'admin','admin@example.test','Admin','admin'), (4,'guest','guest@example.test','Guest','guest');
INSERT INTO categories(id,name,mode_tags,uploader) VALUES(1,'테스트 분류',ARRAY['rpg'],'Writer');
INSERT INTO village(id,name,icon,uploader) VALUES(1,'테스트 마을','/test.png','Writer');
INSERT INTO npc(id,name,icon,village_id,uploader) VALUES(1,'NPC','/test.png',1,'Writer');
INSERT INTO head_finder(id,village_id,uploader) VALUES(1,1,'Writer');
INSERT INTO faq_questions(id,title,content,tags,uploader) VALUES(1,'테스트 질문','테스트 답변',ARRAY['테스트'],'Writer');
