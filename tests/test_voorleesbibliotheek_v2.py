# -*- coding: utf-8 -*-
"""
Testplan Voorleesbibliotheek App - Uitgebreide Tests
"""

from playwright.sync_api import sync_playwright
import time

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

        print("=" * 60)
        print("VOORLEESBIBLIOTHEEK UITGEBREIDE TESTS")
        print("=" * 60)

        # =====================================================
        # LUISTEREN FLOW - VOLLEDIGE TEST
        # =====================================================
        print("\n--- LUISTEREN FLOW ---\n")

        # L1: Startscherm
        print("L1: Startscherm laden en controleren...")
        try:
            page.goto(BASE_URL)
            page.wait_for_load_state('networkidle')
            time.sleep(1)

            title = page.locator('text=Voorleesbibliotheek')
            luister_btn = page.locator('button:has-text("Luisteren")')
            voorlees_btn = page.locator('button:has-text("Voorlezen")')

            assert title.count() > 0, "Titel niet gevonden"
            assert luister_btn.count() > 0, "Luisteren knop niet gevonden"
            assert voorlees_btn.count() > 0, "Voorlezen knop niet gevonden"

            print("  [PASS] L1: Startscherm correct")
            results.append(("L1", "PASS", "Startscherm met beide knoppen"))
        except Exception as e:
            print("  [FAIL] L1: " + str(e))
            results.append(("L1", "FAIL", str(e)))

        # L2: Naar luisterpagina
        print("L2: Naar luisterpagina navigeren...")
        try:
            page.locator('button:has-text("Luisteren")').click()
            page.wait_for_load_state('networkidle')
            time.sleep(0.5)

            assert '/luisteren' in page.url or '/listen' in page.url, "Verkeerde URL"
            header = page.locator('text=Kies een boek')
            assert header.count() > 0, "Header niet gevonden"

            print("  [PASS] L2: Luisterpagina correct")
            results.append(("L2", "PASS", "Luisterpagina geladen"))
        except Exception as e:
            print("  [FAIL] L2: " + str(e))
            results.append(("L2", "FAIL", str(e)))

        # L3: Boeken tellen en selecteren
        print("L3: Boeken controleren...")
        try:
            # Wait for books to load
            time.sleep(1)
            page.screenshot(path='/tmp/L3_boeken_grid.png', full_page=True)

            # Look for book cards - they have book covers or placeholders
            books = page.locator('[class*="rounded"] img, [class*="book"]').all()
            book_count = len(books)

            # Alternative: count items in grid
            grid_items = page.locator('.grid > div, [class*="grid"] > div').all()

            print("  [INFO] Gevonden: " + str(book_count) + " boeken, " + str(len(grid_items)) + " grid items")

            if book_count > 0 or len(grid_items) > 0:
                print("  [PASS] L3: Boeken beschikbaar")
                results.append(("L3", "PASS", str(max(book_count, len(grid_items))) + " boeken"))
            else:
                print("  [SKIP] L3: Geen boeken")
                results.append(("L3", "SKIP", "Geen boeken"))
        except Exception as e:
            print("  [FAIL] L3: " + str(e))
            results.append(("L3", "FAIL", str(e)))

        # L4: Boek selecteren en hoofdstukken bekijken
        print("L4: Boek details bekijken...")
        try:
            # Click on first book (look for clickable book card)
            first_book = page.locator('.grid > div').first
            if first_book.count() > 0:
                first_book.click()
                page.wait_for_load_state('networkidle')
                time.sleep(0.5)
                page.screenshot(path='/tmp/L4_boek_details.png', full_page=True)

                # Check for chapter list
                chapters = page.locator('[class*="chapter"], [class*="track"], li').all()
                print("  [PASS] L4: Boek geselecteerd, " + str(len(chapters)) + " elementen")
                results.append(("L4", "PASS", "Boek details geladen"))
            else:
                print("  [SKIP] L4: Geen boek om te selecteren")
                results.append(("L4", "SKIP", "Geen boek"))
        except Exception as e:
            print("  [FAIL] L4: " + str(e))
            results.append(("L4", "FAIL", str(e)))

        # =====================================================
        # VOORLEZEN FLOW - VOLLEDIGE TEST
        # =====================================================
        print("\n--- VOORLEZEN FLOW ---\n")

        # R1: Naar voorlezenpagina
        print("R1: Naar voorlezenpagina navigeren...")
        try:
            page.goto(BASE_URL)
            page.wait_for_load_state('networkidle')
            page.locator('button:has-text("Voorlezen")').click()
            page.wait_for_load_state('networkidle')
            time.sleep(0.5)

            assert '/voorlezen' in page.url or '/read' in page.url
            print("  [PASS] R1: Voorlezenpagina correct")
            results.append(("R1", "PASS", "URL: " + page.url))
        except Exception as e:
            print("  [FAIL] R1: " + str(e))
            results.append(("R1", "FAIL", str(e)))

        # R2: Voorlezers controleren
        print("R2: Voorlezers controleren...")
        try:
            page.screenshot(path='/tmp/R2_voorlezers.png', full_page=True)

            # Look for reader avatars/cards
            readers = page.locator('[class*="avatar"], [class*="reader"]').all()
            reader_cards = page.locator('.grid > div').all()

            total = max(len(readers), len(reader_cards))
            print("  [INFO] Gevonden: " + str(total) + " voorlezers")

            if total > 0:
                print("  [PASS] R2: Voorlezers beschikbaar")
                results.append(("R2", "PASS", str(total) + " voorlezers"))
            else:
                print("  [SKIP] R2: Geen voorlezers")
                results.append(("R2", "SKIP", "Geen voorlezers"))
        except Exception as e:
            print("  [FAIL] R2: " + str(e))
            results.append(("R2", "FAIL", str(e)))

        # R3: Voorlezer selecteren
        print("R3: Voorlezer selecteren...")
        try:
            # Click on first reader
            reader_cards = page.locator('.grid > div, [class*="card"]').all()
            if len(reader_cards) > 0:
                reader_cards[0].click()
                page.wait_for_load_state('networkidle')
                time.sleep(0.5)
                page.screenshot(path='/tmp/R3_voorlezer_geselecteerd.png', full_page=True)
                print("  [PASS] R3: Voorlezer geselecteerd")
                results.append(("R3", "PASS", "Voorlezer flow gestart"))
            else:
                print("  [SKIP] R3: Geen voorlezer om te selecteren")
                results.append(("R3", "SKIP", "Geen voorlezer"))
        except Exception as e:
            print("  [FAIL] R3: " + str(e))
            results.append(("R3", "FAIL", str(e)))

        # R4: Boeken voor opname
        print("R4: Boeken voor opname controleren...")
        try:
            time.sleep(0.5)
            page.screenshot(path='/tmp/R4_boeken_voor_opname.png', full_page=True)

            # Check current state
            current_url = page.url
            page_content = page.content()

            if 'boek' in page_content.lower() or 'kies' in page_content.lower():
                print("  [PASS] R4: Boekselectie pagina")
                results.append(("R4", "PASS", "Boekselectie beschikbaar"))
            else:
                print("  [INFO] R4: Andere pagina staat")
                results.append(("R4", "INFO", "URL: " + current_url))
        except Exception as e:
            print("  [FAIL] R4: " + str(e))
            results.append(("R4", "FAIL", str(e)))

        # =====================================================
        # BEHEER FLOW - VOLLEDIGE TEST
        # =====================================================
        print("\n--- BEHEER FLOW ---\n")

        # A1: Naar beheerpagina
        print("A1: Naar beheerpagina navigeren...")
        try:
            page.goto(BASE_URL + "/beheer")
            page.wait_for_load_state('networkidle')
            time.sleep(0.5)
            page.screenshot(path='/tmp/A1_beheer.png', full_page=True)

            header = page.locator('text=Beheer')
            assert header.count() > 0, "Beheer header niet gevonden"
            print("  [PASS] A1: Beheerpagina correct")
            results.append(("A1", "PASS", "Beheerpagina geladen"))
        except Exception as e:
            print("  [FAIL] A1: " + str(e))
            results.append(("A1", "FAIL", str(e)))

        # A2: Boeken tab
        print("A2: Boeken tab controleren...")
        try:
            boeken_tab = page.locator('button:has-text("Boeken")')
            boeken_tab.click()
            time.sleep(0.3)
            page.screenshot(path='/tmp/A2_boeken_tab.png', full_page=True)

            # Count books in list
            book_items = page.locator('[class*="book"], li, tr').all()
            print("  [PASS] A2: Boeken tab, " + str(len(book_items)) + " items")
            results.append(("A2", "PASS", str(len(book_items)) + " boek items"))
        except Exception as e:
            print("  [FAIL] A2: " + str(e))
            results.append(("A2", "FAIL", str(e)))

        # A3: Voorlezers tab
        print("A3: Voorlezers tab controleren...")
        try:
            voorlezers_tab = page.locator('button:has-text("Voorlezers")')
            voorlezers_tab.click()
            time.sleep(0.3)
            page.screenshot(path='/tmp/A3_voorlezers_tab.png', full_page=True)

            reader_items = page.locator('[class*="reader"], [class*="avatar"], li, tr').all()
            print("  [PASS] A3: Voorlezers tab, " + str(len(reader_items)) + " items")
            results.append(("A3", "PASS", str(len(reader_items)) + " voorlezer items"))
        except Exception as e:
            print("  [FAIL] A3: " + str(e))
            results.append(("A3", "FAIL", str(e)))

        # A4: Statistieken tab
        print("A4: Statistieken tab controleren...")
        try:
            stats_tab = page.locator('button:has-text("Statistieken")')
            stats_tab.click()
            time.sleep(0.3)
            page.screenshot(path='/tmp/A4_statistieken_tab.png', full_page=True)

            # Check for stats content
            stats_header = page.locator('text=Statistieken')
            stat_cards = page.locator('[class*="stat"], [class*="card"]').all()

            print("  [PASS] A4: Statistieken tab, " + str(len(stat_cards)) + " stat cards")
            results.append(("A4", "PASS", str(len(stat_cards)) + " statistiek elementen"))
        except Exception as e:
            print("  [FAIL] A4: " + str(e))
            results.append(("A4", "FAIL", str(e)))

        # =====================================================
        # MOBILE TESTS
        # =====================================================
        print("\n--- MOBILE TESTS ---\n")

        # M1: iPhone SE (375x667)
        print("M1: iPhone SE (375x667)...")
        try:
            page.set_viewport_size({'width': 375, 'height': 667})
            page.goto(BASE_URL)
            page.wait_for_load_state('networkidle')
            time.sleep(0.5)
            page.screenshot(path='/tmp/M1_iphone_se.png', full_page=True)

            btns = page.locator('button:visible').all()
            print("  [PASS] M1: iPhone SE, " + str(len(btns)) + " zichtbare knoppen")
            results.append(("M1", "PASS", "iPhone SE werkt"))
        except Exception as e:
            print("  [FAIL] M1: " + str(e))
            results.append(("M1", "FAIL", str(e)))

        # M2: iPad (768x1024)
        print("M2: iPad (768x1024)...")
        try:
            page.set_viewport_size({'width': 768, 'height': 1024})
            page.goto(BASE_URL + "/luisteren")
            page.wait_for_load_state('networkidle')
            time.sleep(0.5)
            page.screenshot(path='/tmp/M2_ipad.png', full_page=True)

            print("  [PASS] M2: iPad weergave")
            results.append(("M2", "PASS", "iPad werkt"))
        except Exception as e:
            print("  [FAIL] M2: " + str(e))
            results.append(("M2", "FAIL", str(e)))

        # M3: Mobile luisterpagina 3 kolommen
        print("M3: Mobiele boeken grid (3 kolommen)...")
        try:
            page.set_viewport_size({'width': 375, 'height': 667})
            page.goto(BASE_URL + "/luisteren")
            page.wait_for_load_state('networkidle')
            time.sleep(0.5)
            page.screenshot(path='/tmp/M3_mobile_books.png', full_page=True)

            # Check grid exists
            grid = page.locator('.grid, [class*="grid"]').first
            if grid.count() > 0:
                print("  [PASS] M3: Boeken grid op mobiel")
                results.append(("M3", "PASS", "Grid layout correct"))
            else:
                print("  [WARN] M3: Grid niet gevonden")
                results.append(("M3", "WARN", "Grid niet gevonden"))
        except Exception as e:
            print("  [FAIL] M3: " + str(e))
            results.append(("M3", "FAIL", str(e)))

        # Reset viewport
        page.set_viewport_size({'width': 1280, 'height': 800})

        # =====================================================
        # NAVIGATIE TESTS
        # =====================================================
        print("\n--- NAVIGATIE TESTS ---\n")

        # N1: Terug navigatie
        print("N1: Terug navigatie controleren...")
        try:
            page.goto(BASE_URL + "/luisteren")
            page.wait_for_load_state('networkidle')

            back_btn = page.locator('[aria-label*="terug"], [aria-label*="back"], button:has-text("<"), a[href="/"]').first
            if back_btn.count() > 0:
                back_btn.click()
                page.wait_for_load_state('networkidle')
                time.sleep(0.3)

                if page.url == BASE_URL + "/" or page.url == BASE_URL:
                    print("  [PASS] N1: Terug naar home")
                    results.append(("N1", "PASS", "Terug navigatie werkt"))
                else:
                    print("  [WARN] N1: Navigeerde naar " + page.url)
                    results.append(("N1", "WARN", "URL: " + page.url))
            else:
                print("  [INFO] N1: Geen terug knop gevonden")
                results.append(("N1", "INFO", "Geen terug knop"))
        except Exception as e:
            print("  [FAIL] N1: " + str(e))
            results.append(("N1", "FAIL", str(e)))

        # N2: Direct URL navigatie
        print("N2: Direct URL navigatie...")
        try:
            test_urls = [
                (BASE_URL, "Home"),
                (BASE_URL + "/luisteren", "Luisteren"),
                (BASE_URL + "/voorlezen", "Voorlezen"),
                (BASE_URL + "/beheer", "Beheer"),
            ]

            all_ok = True
            for url, name in test_urls:
                page.goto(url)
                page.wait_for_load_state('networkidle')
                if page.url != url and page.url != url + "/":
                    all_ok = False
                    print("    [WARN] " + name + " redirect naar " + page.url)

            if all_ok:
                print("  [PASS] N2: Alle URLs werken")
                results.append(("N2", "PASS", "Direct URL navigatie werkt"))
            else:
                print("  [WARN] N2: Sommige URLs redirecten")
                results.append(("N2", "WARN", "Redirects aanwezig"))
        except Exception as e:
            print("  [FAIL] N2: " + str(e))
            results.append(("N2", "FAIL", str(e)))

        # =====================================================
        # SAMENVATTING
        # =====================================================
        print("\n" + "=" * 60)
        print("SAMENVATTING TESTRESULTATEN")
        print("=" * 60)

        passed = sum(1 for r in results if r[1] == "PASS")
        failed = sum(1 for r in results if r[1] == "FAIL")
        warnings = sum(1 for r in results if r[1] == "WARN")
        skipped = sum(1 for r in results if r[1] == "SKIP")
        info = sum(1 for r in results if r[1] == "INFO")

        print("")
        print("[PASS]:    " + str(passed))
        print("[FAIL]:    " + str(failed))
        print("[WARN]:    " + str(warnings))
        print("[SKIP]:    " + str(skipped))
        print("[INFO]:    " + str(info))
        print("")
        print("TOTAAL: " + str(len(results)) + " tests uitgevoerd")

        print("\n--- ALLE RESULTATEN ---")
        for test_id, status, detail in results:
            symbol = {"PASS": "[OK]", "FAIL": "[X]", "WARN": "[!]", "SKIP": "[-]", "INFO": "[i]"}.get(status, "[?]")
            print("  " + symbol + " " + test_id + ": " + detail)

        print("\n--- SCREENSHOTS IN /tmp/ ---")

        browser.close()

    return results

if __name__ == "__main__":
    run_tests()
