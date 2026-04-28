--
-- PostgreSQL database dump
--

\restrict oU2znMw6QtwCvoyRzJngSczeHxQtG4z7tyY2cjvVh7Pg1hJCpbJZNbWGufMzNqm

-- Dumped from database version 17.7 (Ubuntu 17.7-0ubuntu0.25.04.1)
-- Dumped by pg_dump version 17.7 (Ubuntu 17.7-0ubuntu0.25.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: update_search_vector(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_search_vector() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.search_vector := to_tsvector('english', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''));
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_search_vector() OWNER TO postgres;

--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    color character varying(20) DEFAULT '#e8e8e8'::character varying,
    sort_order integer DEFAULT 0,
    last_accessed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.campaigns OWNER TO postgres;

--
-- Name: document_tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.document_tags (
    document_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.document_tags OWNER TO postgres;

--
-- Name: folders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    color character varying(7) DEFAULT '#6B7280'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sort_order integer DEFAULT 0,
    last_accessed_at timestamp with time zone
);


ALTER TABLE public.folders OWNER TO postgres;

--
-- Name: knowledge_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.knowledge_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(500) NOT NULL,
    content text NOT NULL,
    content_hash character varying(64) NOT NULL,
    token_count integer,
    summary text,
    source_type character varying(50) DEFAULT 'manual_paste'::character varying NOT NULL,
    folder_id uuid,
    search_vector tsvector,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    campaign_id uuid
);


ALTER TABLE public.knowledge_documents OWNER TO postgres;

--
-- Name: tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    color character varying(7) DEFAULT '#6B7280'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.tags OWNER TO postgres;

--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: document_tags document_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_tags
    ADD CONSTRAINT document_tags_pkey PRIMARY KEY (document_id, tag_id);


--
-- Name: folders folders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_pkey PRIMARY KEY (id);


--
-- Name: knowledge_documents knowledge_documents_content_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_documents
    ADD CONSTRAINT knowledge_documents_content_hash_key UNIQUE (content_hash);


--
-- Name: knowledge_documents knowledge_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_documents
    ADD CONSTRAINT knowledge_documents_pkey PRIMARY KEY (id);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: idx_document_tags_document_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_document_tags_document_id ON public.document_tags USING btree (document_id);


--
-- Name: idx_document_tags_tag_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_document_tags_tag_id ON public.document_tags USING btree (tag_id);


--
-- Name: idx_folders_name_lower; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_folders_name_lower ON public.folders USING btree (lower((name)::text));


--
-- Name: idx_knowledge_docs_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_knowledge_docs_created_at ON public.knowledge_documents USING btree (created_at DESC);


--
-- Name: idx_knowledge_documents_campaign_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_knowledge_documents_campaign_id ON public.knowledge_documents USING btree (campaign_id);


--
-- Name: idx_knowledge_documents_content_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_knowledge_documents_content_hash ON public.knowledge_documents USING btree (content_hash);


--
-- Name: idx_knowledge_documents_folder_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_knowledge_documents_folder_id ON public.knowledge_documents USING btree (folder_id);


--
-- Name: idx_knowledge_documents_search_vector; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_knowledge_documents_search_vector ON public.knowledge_documents USING gin (search_vector);


--
-- Name: idx_tags_name_lower; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_tags_name_lower ON public.tags USING btree (lower((name)::text));


--
-- Name: folders trigger_update_folders_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_folders_updated_at BEFORE UPDATE ON public.folders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: knowledge_documents trigger_update_search_vector; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_search_vector BEFORE INSERT OR UPDATE ON public.knowledge_documents FOR EACH ROW EXECUTE FUNCTION public.update_search_vector();


--
-- Name: knowledge_documents trigger_update_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_updated_at BEFORE UPDATE ON public.knowledge_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: document_tags document_tags_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_tags
    ADD CONSTRAINT document_tags_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: document_tags document_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_tags
    ADD CONSTRAINT document_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: knowledge_documents knowledge_documents_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_documents
    ADD CONSTRAINT knowledge_documents_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: knowledge_documents knowledge_documents_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.knowledge_documents
    ADD CONSTRAINT knowledge_documents_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict oU2znMw6QtwCvoyRzJngSczeHxQtG4z7tyY2cjvVh7Pg1hJCpbJZNbWGufMzNqm

