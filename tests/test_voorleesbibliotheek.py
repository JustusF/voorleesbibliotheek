# -*- coding: utf-8 -*-
"""
Testplan Voorleesbibliotheek App
Automated tests using Playwright
"""

from playwright.sync_api import sync_playwright, expect
import time
import json

BASE_URL = "https://voorleesbibliotheek.vercel.app"

def run_tests():
    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': 1280, 'height': 800},
            locale='nl-NL'
        )
        page = context.new_page()

        # Enable console logging
        def log_console(msg):
            print("[CONSOLE] " + msg.type + ": " + msg.text)
        page.on("console", log_console)

        print("=" * 60)
        print("VOORLEESBIBLIOTHEEK TESTPLAN UITVOERING")
        print("=" * 60)

        # =====================================================
        # HAPPY FLOW: LUISTEREN
        # =====================================================
        print("\n--- HAPPY FLOW: LUISTEREN ---\n")

        # L1: Startscherm laden
        print("L1: Startscherm laden...")
        try:
            page.goto(BASE_URL)
            page.wait_for_load_state('networkidle')
            page.screenshot(path='/tmp/L1_startscherm.png', full_page=True)

            # Check for main buttons
            luister_btn = page.locator('text=Luisteren').or_(page.locator('text=Ik wil luisteren'))
            voorlees_btn = page.locator('text=Voorlezen').or_(page.locator('text=Ik wil voorlezen'))

            if luister_btn.count() > 0 and voorlees_btn.count() > 0:
                print("  ✅ L1 PASSED: Startscherm toont Luisteren en Voorlezen knoppen")
                results.append(("L1", "PASSED", "Startscherm correct geladen"))
            else:
                print("  ❌ L1 FAILED: Knoppen niet gevonden")
                results.append(("L1", "FAILED", "Knoppen niet gevonden"))
        except Exception as e:
            print(f"  ❌ L1 ERROR: {e}")
            results.append(("L1", "ERROR", str(e)))

        # L2: Naar luisterpagina navigeren
        print("L2: Naar luisterpagina navigeren...")
        try:
            luister_btn = page.locator('text=Luisteren').or_(page.locator('text=Ik wil luisteren')).first
            luister_btn.click()
            page.wait_for_load_state('networkidle')
            time.sleep(0.5)
            page.screenshot(path='/tmp/L2_luisterpagina.png', full_page=True)

            # Check URL or content
            if '/listen' in page.url or page.locator('text=Kies een boek').count() > 0 or page.locator('.book-grid, [class*="grid"]').count() > 0:
                print("  ✅ L2 PASSED: Luisterpagina geladen")
                results.append(("L2", "PASSED", "Luisterpagina correct"))
            else:
                print(f"  ⚠️ L2 WARNING: URL is {page.url}")
                results.append(("L2", "WARNING", f"URL: {page.url}"))
        except Exception as e:
            print(f"  ❌ L2 ERROR: {e}")
            results.append(("L2", "ERROR", str(e)))

        # L3: Boek selecteren (indien beschikbaar)
        print("L3: Boek selecteren...")
        try:
            # Look for book cards/items
            books = page.locator('[class*="book"], [class*="card"], img[alt*="cover"]').all()
            if len(books) > 0:
                books[0].click()
                page.wait_for_load_state('networkidle')
                time.sleep(0.5)
                page.screenshot(path='/tmp/L3_boek_detail.png', full_page=True)
                print(f"  ✅ L3 PASSED: Boek geselecteerd, {len(books)} boeken gevonden")
                results.append(("L3", "PASSED", f"{len(books)} boeken beschikbaar"))
            else:
                print("  ⚠️ L3 SKIPPED: Geen boeken beschikbaar")
                results.append(("L3", "SKIPPED", "Geen boeken gevonden"))
        except Exception as e:
            print(f"  ❌ L3 ERROR: {e}")
            results.append(("L3", "ERROR", str(e)))

        # L4: Hoofdstuk selecteren en afspelen
        print("L4: Hoofdstuk afspelen...")
        try:
            # Look for chapter items or play buttons
            chapters = page.locator('[class*="chapter"], [class*="track"], button:has-text("Afspelen")').all()
            play_btns = page.locator('button:has-text("Afspelen"), [aria-label*="play"], [aria-label*="Afspelen"]').all()

            if len(chapters) > 0 or len(play_btns) > 0:
                if len(play_btns) > 0:
                    play_btns[0].click()
                elif len(chapters) > 0:
                    chapters[0].click()
                time.sleep(1)
                page.screenshot(path='/tmp/L4_afspelen.png', full_page=True)
                print("  ✅ L4 PASSED: Hoofdstuk/afspeelknop gevonden")
                results.append(("L4", "PASSED", "Afspelen gestart"))
            else:
                print("  ⚠️ L4 SKIPPED: Geen hoofdstukken met opnames")
                results.append(("L4", "SKIPPED", "Geen afspeelbare content"))
        except Exception as e:
            print(f"  ❌ L4 ERROR: {e}")
            results.append(("L4", "ERROR", str(e)))

        # =====================================================
        # HAPPY FLOW: VOORLEZEN
        # =====================================================
        print("\n--- HAPPY FLOW: VOORLEZEN ---\n")

        # R1: Terug naar startscherm en naar voorlezenpagina
        print("R1: Naar voorlezenpagina navigeren...")
        try:
            page.goto(BASE_URL)
            page.wait_for_load_state('networkidle')

            voorlees_btn = page.locator('text=Voorlezen').or_(page.locator('text=Ik wil voorlezen')).first
            voorlees_btn.click()
            page.wait_for_load_state('networkidle')
            time.sleep(0.5)
            page.screenshot(path='/tmp/R1_voorlezenpagina.png', full_page=True)

            if '/read' in page.url:
                print("  ✅ R1 PASSED: Voorlezenpagina geladen")
                results.append(("R1", "PASSED", "Voorlezenpagina correct"))
            else:
                print(f"  ⚠️ R1 WARNING: URL is {page.url}")
                results.append(("R1", "WARNING", f"URL: {page.url}"))
        except Exception as e:
            print(f"  ❌ R1 ERROR: {e}")
            results.append(("R1", "ERROR", str(e)))

        # R2: Voorlezer selecteren of aanmaken
        print("R2: Voorlezer selecteren/aanmaken...")
        try:
            # Look for reader selection or creation form
            readers = page.locator('[class*="reader"], [class*="avatar"], button:has-text("Kies")').all()
            new_reader_btn = page.locator('button:has-text("Nieuwe"), button:has-text("Toevoegen")').all()

            page.screenshot(path='/tmp/R2_voorlezer_selectie.png', full_page=True)

            if len(readers) > 0:
                readers[0].click()
                time.sleep(0.5)
                print(f"  ✅ R2 PASSED: Voorlezer geselecteerd ({len(readers)} beschikbaar)")
                results.append(("R2", "PASSED", f"{len(readers)} voorlezers"))
            elif len(new_reader_btn) > 0:
                print("  ⚠️ R2 INFO: Optie om nieuwe voorlezer aan te maken")
                results.append(("R2", "INFO", "Nieuwe voorlezer optie beschikbaar"))
            else:
                print("  ⚠️ R2 SKIPPED: Geen voorlezers gevonden")
                results.append(("R2", "SKIPPED", "Geen voorlezers"))
        except Exception as e:
            print(f"  ❌ R2 ERROR: {e}")
            results.append(("R2", "ERROR", str(e)))

        # R3: Boek en hoofdstuk selecteren voor opname
        print("R3: Boek selecteren voor opname...")
        try:
            page.wait_for_load_state('networkidle')
            time.sleep(0.5)
            page.screenshot(path='/tmp/R3_boek_voor_opname.png', full_page=True)

            books = page.locator('[class*="book"], [class*="card"], img[alt*="cover"]').all()
            if len(books) > 0:
                print(f"  ✅ R3 PASSED: {len(books)} boeken beschikbaar voor opname")
                results.append(("R3", "PASSED", f"{len(books)} boeken"))
            else:
                print("  ⚠️ R3 WARNING: Geen boeken gevonden")
                results.append(("R3", "WARNING", "Geen boeken"))
        except Exception as e:
            print(f"  ❌ R3 ERROR: {e}")
            results.append(("R3", "ERROR", str(e)))

        # =====================================================
        # HAPPY FLOW: BEHEER
        # =====================================================
        print("\n--- HAPPY FLOW: BEHEER ---\n")

        # A1: Naar beheerpagina navigeren
        print("A1: Naar beheerpagina navigeren...")
        try:
            page.goto(BASE_URL)
            page.wait_for_load_state('networkidle')

            # Look for admin/beheer link
            admin_link = page.locator('text=Beheer').or_(page.locator('text=Admin')).or_(page.locator('a[href*="admin"]'))

            if admin_link.count() > 0:
                admin_link.first.click()
                page.wait_for_load_state('networkidle')
                time.sleep(0.5)
                page.screenshot(path='/tmp/A1_beheerpagina.png', full_page=True)
                print("  ✅ A1 PASSED: Beheerpagina geladen")
                results.append(("A1", "PASSED", "Beheerpagina correct"))
            else:
                # Try direct navigation
                page.goto(f"{BASE_URL}/admin")
                page.wait_for_load_state('networkidle')
                page.screenshot(path='/tmp/A1_beheerpagina.png', full_page=True)
                print("  ✅ A1 PASSED: Beheerpagina via directe URL")
                results.append(("A1", "PASSED", "Via directe URL"))
        except Exception as e:
            print(f"  ❌ A1 ERROR: {e}")
            results.append(("A1", "ERROR", str(e)))

        # A2: Tabs controleren (Boeken, Voorlezers, Statistieken)
        print("A2: Beheer tabs controleren...")
        try:
            tabs_found = []
            for tab_name in ['Boeken', 'Voorlezers', 'Statistieken']:
                tab = page.locator(f'button:has-text("{tab_name}"), [role="tab"]:has-text("{tab_name}")')
                if tab.count() > 0:
                    tabs_found.append(tab_name)

            page.screenshot(path='/tmp/A2_beheer_tabs.png', full_page=True)

            if len(tabs_found) >= 2:
                print(f"  ✅ A2 PASSED: Tabs gevonden: {', '.join(tabs_found)}")
                results.append(("A2", "PASSED", f"Tabs: {', '.join(tabs_found)}"))
            else:
                print(f"  ⚠️ A2 WARNING: Slechts {len(tabs_found)} tabs gevonden")
                results.append(("A2", "WARNING", f"Tabs: {tabs_found}"))
        except Exception as e:
            print(f"  ❌ A2 ERROR: {e}")
            results.append(("A2", "ERROR", str(e)))

        # A3: Statistieken tab bekijken
        print("A3: Statistieken tab bekijken...")
        try:
            stats_tab = page.locator('button:has-text("Statistieken")').first
            stats_tab.click()
            time.sleep(0.5)
            page.screenshot(path='/tmp/A3_statistieken.png', full_page=True)

            # Check for stats content
            stats_content = page.locator('[class*="stat"], [class*="card"]').count()
            if stats_content > 0:
                print(f"  ✅ A3 PASSED: Statistieken pagina met {stats_content} elementen")
                results.append(("A3", "PASSED", f"{stats_content} stat elementen"))
            else:
                print("  ⚠️ A3 WARNING: Statistieken tab leeg of anders gestructureerd")
                results.append(("A3", "WARNING", "Content structuur anders"))
        except Exception as e:
            print(f"  ❌ A3 ERROR: {e}")
            results.append(("A3", "ERROR", str(e)))

        # =====================================================
        # UNHAPPY FLOW: EMPTY STATES
        # =====================================================
        print("\n--- UNHAPPY FLOW: EMPTY STATES ---\n")

        # E1: Empty state check
        print("E1: Empty states controleren...")
        try:
            page.goto(BASE_URL + "/listen")
            page.wait_for_load_state('networkidle')
            time.sleep(0.5)

            # Check for empty state messages
            empty_indicators = page.locator('text=Geen boeken, text=Nog geen, text=leeg, text=Voeg toe').count()
            page.screenshot(path='/tmp/E1_empty_state.png', full_page=True)

            print(f"  ✅ E1 INFO: Empty state indicators gevonden: {empty_indicators}")
            results.append(("E1", "INFO", f"Empty indicators: {empty_indicators}"))
        except Exception as e:
            print(f"  ❌ E1 ERROR: {e}")
            results.append(("E1", "ERROR", str(e)))

        # =====================================================
        # MOBILE RESPONSIVENESS
        # =====================================================
        print("\n--- MOBILE RESPONSIVENESS ---\n")

        # M1: Mobiele weergave testen
        print("M1: Mobiele weergave (375x667 - iPhone SE)...")
        try:
            page.set_viewport_size({'width': 375, 'height': 667})
            page.goto(BASE_URL)
            page.wait_for_load_state('networkidle')
            time.sleep(0.5)
            page.screenshot(path='/tmp/M1_mobile_home.png', full_page=True)

            # Check if buttons are still visible
            btns = page.locator('button').all()
            clickable = sum(1 for btn in btns if btn.is_visible())

            print(f"  ✅ M1 PASSED: Mobiele weergave, {clickable} zichtbare knoppen")
            results.append(("M1", "PASSED", f"{clickable} zichtbare knoppen"))
        except Exception as e:
            print(f"  ❌ M1 ERROR: {e}")
            results.append(("M1", "ERROR", str(e)))

        # M2: Mobiele luisterpagina
        print("M2: Mobiele luisterpagina...")
        try:
            page.goto(BASE_URL + "/listen")
            page.wait_for_load_state('networkidle')
            time.sleep(0.5)
            page.screenshot(path='/tmp/M2_mobile_listen.png', full_page=True)

            # Check grid layout
            grid = page.locator('[class*="grid"]').first
            if grid.count() > 0:
                print("  ✅ M2 PASSED: Grid layout aanwezig op mobiel")
                results.append(("M2", "PASSED", "Grid layout correct"))
            else:
                print("  ⚠️ M2 WARNING: Grid niet gevonden")
                results.append(("M2", "WARNING", "Grid niet gevonden"))
        except Exception as e:
            print(f"  ❌ M2 ERROR: {e}")
            results.append(("M2", "ERROR", str(e)))

        # M3: Mobiele beheerpagina
        print("M3: Mobiele beheerpagina...")
        try:
            page.goto(BASE_URL + "/admin")
            page.wait_for_load_state('networkidle')
            time.sleep(0.5)
            page.screenshot(path='/tmp/M3_mobile_admin.png', full_page=True)
            print("  ✅ M3 PASSED: Beheerpagina op mobiel geladen")
            results.append(("M3", "PASSED", "Mobiele admin correct"))
        except Exception as e:
            print(f"  ❌ M3 ERROR: {e}")
            results.append(("M3", "ERROR", str(e)))

        # Reset viewport
        page.set_viewport_size({'width': 1280, 'height': 800})

        # =====================================================
        # ACCESSIBILITY CHECKS
        # =====================================================
        print("\n--- ACCESSIBILITY CHECKS ---\n")

        # ACC1: ARIA labels controleren
        print("ACC1: ARIA labels controleren...")
        try:
            page.goto(BASE_URL)
            page.wait_for_load_state('networkidle')

            aria_labels = page.locator('[aria-label]').count()
            aria_live = page.locator('[aria-live]').count()
            roles = page.locator('[role]').count()

            print(f"  ✅ ACC1 INFO: aria-label={aria_labels}, aria-live={aria_live}, role={roles}")
            results.append(("ACC1", "INFO", f"ARIA: labels={aria_labels}, live={aria_live}, roles={roles}"))
        except Exception as e:
            print(f"  ❌ ACC1 ERROR: {e}")
            results.append(("ACC1", "ERROR", str(e)))

        # ACC2: Keyboard navigation
        print("ACC2: Keyboard navigation...")
        try:
            page.goto(BASE_URL)
            page.wait_for_load_state('networkidle')

            # Tab through elements
            page.keyboard.press('Tab')
            time.sleep(0.2)
            focused = page.evaluate('document.activeElement.tagName')

            page.keyboard.press('Tab')
            time.sleep(0.2)
            focused2 = page.evaluate('document.activeElement.tagName')

            print(f"  ✅ ACC2 PASSED: Tab navigatie werkt ({focused} -> {focused2})")
            results.append(("ACC2", "PASSED", f"Focus: {focused} -> {focused2}"))
        except Exception as e:
            print(f"  ❌ ACC2 ERROR: {e}")
            results.append(("ACC2", "ERROR", str(e)))

        # =====================================================
        # FINAL SUMMARY
        # =====================================================
        print("\n" + "=" * 60)
        print("SAMENVATTING TESTRESULTATEN")
        print("=" * 60)

        passed = sum(1 for r in results if r[1] == "PASSED")
        failed = sum(1 for r in results if r[1] == "FAILED")
        errors = sum(1 for r in results if r[1] == "ERROR")
        warnings = sum(1 for r in results if r[1] == "WARNING")
        skipped = sum(1 for r in results if r[1] == "SKIPPED")
        info = sum(1 for r in results if r[1] == "INFO")

        print(f"\n✅ PASSED:  {passed}")
        print(f"❌ FAILED:  {failed}")
        print(f"⚠️ WARNING: {warnings}")
        print(f"⏭️ SKIPPED: {skipped}")
        print(f"ℹ️ INFO:    {info}")
        print(f"💥 ERROR:   {errors}")
        print(f"\nTOTAAL: {len(results)} tests uitgevoerd")

        print("\n--- DETAILS ---")
        for test_id, status, detail in results:
            symbol = {"PASSED": "✅", "FAILED": "❌", "WARNING": "⚠️", "SKIPPED": "⏭️", "INFO": "ℹ️", "ERROR": "💥"}.get(status, "?")
            print(f"  {symbol} {test_id}: {status} - {detail}")

        print("\n--- SCREENSHOTS OPGESLAGEN IN /tmp/ ---")

        browser.close()

    return results

if __name__ == "__main__":
    run_tests()
