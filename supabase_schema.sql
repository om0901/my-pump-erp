-- ==============================================================================
-- MY PUMP ERP - Supabase Cloud Schema & Account-Wise Data Isolation Setup
-- File: supabase_schema.sql
-- ==============================================================================
-- Run this script in your Supabase Project -> SQL Editor to create the isolated
-- station data table and enable strict Row Level Security (RLS) policies.
-- ==============================================================================

-- 1. Create pump_station_data table
CREATE TABLE IF NOT EXISTS public.pump_station_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    station_profile JSONB DEFAULT '{}'::jsonb,
    nozzle_config JSONB DEFAULT '[]'::jsonb,
    fuel_rates JSONB DEFAULT '{}'::jsonb,
    dip_levels JSONB DEFAULT '{}'::jsonb,
    daily_shifts JSONB DEFAULT '[]'::jsonb,
    other_accounts JSONB DEFAULT '{}'::jsonb,
    bank_hisab JSONB DEFAULT '[]'::jsonb,
    staff_attendance JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Fast index on user_id for high-speed scoped queries
CREATE INDEX IF NOT EXISTS idx_pump_station_data_user_id 
    ON public.pump_station_data(user_id);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.pump_station_data ENABLE ROW LEVEL SECURITY;

-- 4. Enable RLS Policy: Users can only view, insert, update and delete their own petrol pump data
DROP POLICY IF EXISTS "Users manage own pump data" ON public.pump_station_data;

CREATE POLICY "Users manage own pump data"
    ON public.pump_station_data
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 5. Auto-update updated_at timestamp trigger
CREATE OR REPLACE FUNCTION public.handle_pump_station_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pump_station_data_updated_at ON public.pump_station_data;
CREATE TRIGGER trg_pump_station_data_updated_at
    BEFORE UPDATE ON public.pump_station_data
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_pump_station_updated_at();

-- 6. Add to Realtime publication (optional, for cross-device live sync)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'pump_station_data'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.pump_station_data;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;
