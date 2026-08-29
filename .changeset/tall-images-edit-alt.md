---
"@jmas/wryte": minor
---

Add image alt-text editing (Trix-style): selecting a block image opens an image-tools bubble with **Edit alt text** and **Remove**. The alt form (input + Apply/Remove) mirrors the link form and stores the value on the image node via the new `Editor#setImageAlt(alt)`. Right-clicking an image NodeSelects it and opens the same bubble.
