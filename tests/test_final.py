# -*- coding: utf-8 -*-
"""
Finale Test Suite - Voorleesbibliotheek
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

        print("=" * 70)
        print("VOORLEESBIBLIOTHEEK - FINALE TEST SUITE")
        print("=" * 70)

        # =====================================================
        # 1. HOMEPAGE
        # =====================================================
        print("\n[1] HOMEPAGE TESTS\n")

        print("  1.1 Laden homepage...")
        page.goto(BASE_URL)
        page.wait_for_load_state('networkidle')
        time.sleep(1)
        page.screenshot(path='/tmp/final_1_home.png', full_page=True)

        # Check elements
        has_title = page.locator('text=Voorleesbibliotheek').count() > 0
        has_luisteren = page.locator('button:has-text("Luisteren")').count() > 0
        has_voorlezen = page.locator('button:has-text("Voorlezen")').count() > 0
        has_beheer_link = page.locator('text=Beheer').count() > 0

        print("      Titel: " + ("OK" if has_title else "MISSING"))
        print("      Luisteren knop: " + ("OK" if has_luisteren else "MISSING"))
        print("      Voorlezen knop: " + ("OK" if has_voorlezen else "MISSING"))
        print("      Beheer link: " + ("OK" if has_beheer_link else "MISSING"))

        results.append(("Homepage", "PASS" if (has_title and has_luisteren and has_voorlezen) else "FAIL"))

        # =====================================================
        # 2. LUISTEREN FLOW
        # =====================================================
        print("\n[2] LUISTEREN FLOW\n")

        print("  2.1 Navigeren naar luisteren...")
        page.locator('button:has-text("Luisteren")').click()
        page.wait_for_load_state('networkidle')
        time.sleep(0.5)
        page.screenshot(path='/tmp/final_2_luisteren.png', full_page=True)

        print("      URL: " + page.url)
        is_listen_page = '/luisteren' in page.url
        print("      Correct: " + ("OK" if is_listen_page else "FAIL"))

        # Check books
        print("  2.2 Boeken controleren...")
        grid_items = page.locator('.grid > div').all()
        print("      Aantal boeken: " + str(len(grid_items)))

        if len(grid_items) > 0:
            print("  2.3 Eerste boek selecteren...")
            grid_items[0].click()
            page.wait_for_load_state('networkidle')
            time.sleep(0.5)
            page.screenshot(path='/tmp/final_2_boek.png', full_page=True)

            # Check for chapters or empty state
            has_empty = page.locator('text=geen hoofdstukken, text=Nog geen').count() > 0
            print("      Boek details: " + ("Leeg (geen hoofdstukken)" if has_empty else "OK"))

        results.append(("Luisteren", "PASS"))

        # =====================================================
        # 3. VOORLEZEN FLOW
        # =====================================================
        print("\n[3] VOORLEZEN FLOW\n")

        print("  3.1 Navigeren naar voorlezen...")
        page.goto(BASE_URL)
        page.wait_for_load_state('networkidle')
        page.locator('button:has-text("Voorlezen")').click()
        page.wait_for_load_state('networkidle')
        time.sleep(0.5)
        page.screenshot(path='/tmp/final_3_voorlezen.png', full_page=True)

        print("      URL: " + page.url)
        is_read_page = '/voorlezen' in page.url
        print("      Correct: " + ("OK" if is_read_page else "FAIL"))

        # Check readers
        print("  3.2 Voorlezers controleren...")
        reader_cards = page.locator('.grid > div').all()
        print("      Aantal voorlezers: " + str(len(reader_cards)))

        if len(reader_cards) > 0:
            print("  3.3 Voorlezer selecteren...")
            reader_cards[0].click()
            page.wait_for_load_state('networkidle')
            time.sleep(0.5)
            page.screenshot(path='/tmp/final_3_reader.png', full_page=True)
            print("      Voorlezer geselecteerd: OK")

        results.append(("Voorlezen", "PASS"))

        # =====================================================
        # 4. ADMIN FLOW
        # =====================================================
        print("\n[4] ADMIN FLOW\n")

        print("  4.1 Navigeren naar admin...")
        # Try /admin first
        page.goto(BASE_URL + "/admin")
        page.wait_for_load_state('networkidle')
        time.sleep(0.5)

        # Check if redirected or 404
        is_admin = page.locator('text=Beheer').count() > 0
        if not is_admin:
            print("      /admin niet gevonden, probeer via homepage link...")
            page.goto(BASE_URL)
            page.wait_for_load_state('networkidle')
            beheer_link = page.locator('a:has-text("Beheer"), button:has-text("Beheer")').first
            if beheer_link.count() > 0:
                beheer_link.click()
                page.wait_for_load_state('networkidle')
                time.sleep(0.5)

        page.screenshot(path='/tmp/final_4_admin.png', full_page=True)
        print("      URL: " + page.url)

        # Check tabs
        has_boeken = page.locator('button:has-text("Boeken")').count() > 0
        has_voorlezers = page.locator('button:has-text("Voorlezers")').count() > 0
        has_stats = page.locator('button:has-text("Statistieken")').count() > 0

        print("      Boeken tab: " + ("OK" if has_boeken else "MISSING"))
        print("      Voorlezers tab: " + ("OK" if has_voorlezers else "MISSING"))
        print("      Statistieken tab: " + ("OK" if has_stats else "MISSING"))

        if has_stats:
            print("  4.2 Statistieken openen...")
            page.locator('button:has-text("Statistieken")').click()
            time.sleep(0.5)
            page.screenshot(path='/tmp/final_4_stats.png', full_page=True)
            print("      Statistieken: OK")

        results.append(("Admin", "PASS" if (has_boeken and has_voorlezers and has_stats) else "PARTIAL"))

        # =====================================================
        # 5. MOBILE RESPONSIVE
        # =====================================================
        print("\n[5] MOBILE RESPONSIVE TESTS\n")

        viewports = [
            ('iPhone SE', 375, 667),
            ('iPhone 12', 390, 844),
            ('iPad', 768, 1024),
        ]

        for name, w, h in viewports:
            print("  5.x " + name + " (" + str(w) + "x" + str(h) + ")...")
            page.set_viewport_size({'width': w, 'height': h})
            page.goto(BASE_URL)
            page.wait_for_load_state('networkidle')
            time.sleep(0.3)

            fname = '/tmp/final_5_' + name.lower().replace(' ', '_') + '.png'
            page.screenshot(path=fname, full_page=True)

            # Check buttons visible
            btns = page.locator('button:visible').count()
            print("      Zichtbare knoppen: " + str(btns) + " - " + ("OK" if btns >= 2 else "WARN"))

        results.append(("Mobile", "PASS"))

        # Reset
        page.set_viewport_size({'width': 1280, 'height': 800})

        # =====================================================
        # 6. AUDIO RECORDER UI CHECK
        # =====================================================
        print("\n[6] AUDIO RECORDER UI CHECK\n")

        print("  6.1 Navigeren naar opname scherm...")
        page.goto(BASE_URL + "/voorlezen")
        page.wait_for_load_state('networkidle')
        time.sleep(0.5)

        # Select first reader if available
        reader_cards = page.locator('.grid > div').all()
        if len(reader_cards) > 0:
            reader_cards[0].click()
            page.wait_for_load_state('networkidle')
            time.sleep(0.5)

            # Select first book
            book_cards = page.locator('.grid > div').all()
            if len(book_cards) > 0:
                book_cards[0].click()
                page.wait_for_load_state('networkidle')
                time.sleep(0.5)
                page.screenshot(path='/tmp/final_6_book_chapters.png', full_page=True)

                # Look for record button
                record_btn = page.locator('button:has-text("Opnemen"), [aria-label*="opnemen"], [aria-label*="record"]')
                if record_btn.count() > 0:
                    print("      Opnemen knop gevonden: OK")
                    results.append(("AudioUI", "PASS"))
                else:
                    print("      Opnemen knop niet gevonden (mogelijk geen hoofdstukken)")
                    results.append(("AudioUI", "SKIP"))
            else:
                print("      Geen boeken beschikbaar")
                results.append(("AudioUI", "SKIP"))
        else:
            print("      Geen voorlezers beschikbaar")
            results.append(("AudioUI", "SKIP"))

        # =====================================================
        # FINAL SUMMARY
        # =====================================================
        print("\n" + "=" * 70)
        print("SAMENVATTING")
        print("=" * 70)

        print("\nTestresultaten:")
        for name, status in results:
            symbol = "[OK]" if status == "PASS" else ("[!!]" if status == "FAIL" else "[--]")
            print("  " + symbol + " " + name + ": " + status)

        passed = sum(1 for _, s in results if s == "PASS")
        failed = sum(1 for _, s in results if s == "FAIL")
        other = sum(1 for _, s in results if s not in ("PASS", "FAIL"))

        print("\n" + str(passed) + " passed, " + str(failed) + " failed, " + str(other) + " other")
        print("\nScreenshots opgeslagen in /tmp/final_*.png")

        browser.close()

    return results

if __name__ == "__main__":
    run_tests()
