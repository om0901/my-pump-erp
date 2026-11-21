-- ==============================================================================
-- MY PUMP ERP — Production Supabase Database Schema & Row-Level Security (RLS)
-- Run this script in your Supabase SQL Editor: https://supabase.com/dashboard/project/rfgnrqzrsanibgkuyhqw/sql
-- ==============================================================================

-- 1. Create Station Data Table for Isolated Cloud Sync
CREATE TABLE IF NOT EXISTS public.station_data (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Enable Row-Level Security (RLS)
ALTER TABLE public.station_data ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policy: Users can only read their own station data
CREATE POLICY "Users can read own station data"
    ON public.station_data
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- 4. RLS Policy: Users can only insert or update their own station data
CREATE POLICY "Users can insert own station data"
    ON public.station_data
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own station data"
    ON public.station_data
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 5. Auto-update updated_at timestamp trigger
CREATE OR REPLACE FUNCTION update_station_data_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_station_data_timestamp ON public.station_data;
CREATE TRIGGER tr_station_data_timestamp
    BEFORE UPDATE ON public.station_data
    FOR EACH ROW
    EXECUTE FUNCTION update_station_data_timestamp();
