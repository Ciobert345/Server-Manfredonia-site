-- Migrazione per aggiungere il supporto al provider Pterodactyl

-- 1. Aggiungi colonne per il provider a global_config
ALTER TABLE public.global_config 
ADD COLUMN IF NOT EXISTS server_provider TEXT DEFAULT 'mcss',
ADD COLUMN IF NOT EXISTS pterodactyl_api_url TEXT DEFAULT 'https://panel.example.com';

-- 2. Creazione della tabella per le chiavi Pterodactyl (Master Standard e Master Admin)
CREATE TABLE IF NOT EXISTS public.pterodactyl_configs (
    id TEXT PRIMARY KEY,
    pterodactyl_api_key TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Inserimento record di default se non presenti
INSERT INTO public.pterodactyl_configs (id, pterodactyl_api_key)
VALUES 
    ('standard', ''),
    ('admin', '')
ON CONFLICT (id) DO NOTHING;

-- 4. (Opzionale) Aggiunta della colonna pterodactyl_config_id nei profili utente per chiavi personali Pterodactyl
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS pterodactyl_config_id TEXT REFERENCES public.pterodactyl_configs(id) ON DELETE SET NULL;

-- 5. Row Level Security (RLS) Policies
-- Abilita la Row Level Security sulla tabella
ALTER TABLE public.pterodactyl_configs ENABLE ROW LEVEL SECURITY;

-- Permetti la lettura a tutti gli utenti autenticati (necessario per caricare le master keys)
DROP POLICY IF EXISTS "Allow authenticated read on pterodactyl_configs" ON public.pterodactyl_configs;
CREATE POLICY "Allow authenticated read on pterodactyl_configs"
ON public.pterodactyl_configs FOR SELECT
TO authenticated
USING (true);

-- Permetti inserimento, modifica ed eliminazione solo agli amministratori
DROP POLICY IF EXISTS "Allow admin full access on pterodactyl_configs" ON public.pterodactyl_configs;
CREATE POLICY "Allow admin full access on pterodactyl_configs"
ON public.pterodactyl_configs FOR ALL
TO authenticated
USING (
  (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
);
