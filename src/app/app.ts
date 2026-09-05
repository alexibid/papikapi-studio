import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'kirigami-root',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
