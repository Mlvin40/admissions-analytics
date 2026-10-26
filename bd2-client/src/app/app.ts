import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MobileNavigation } from './layout/mobile-navigation';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MobileNavigation],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  scrollToTop(): void {
    window.scrollTo(0, 0);
  }
}
