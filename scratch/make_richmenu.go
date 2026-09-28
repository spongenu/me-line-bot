package main

import (
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"os"
)

func main() {
	width := 2500
	height := 843

	img := image.NewRGBA(image.Rect(0, 0, width, height))

	// Colors
	col1 := color.RGBA{173, 216, 230, 255} // Light Blue
	col2 := color.RGBA{255, 228, 181, 255} // Moccasin (Light Orange)
	col3 := color.RGBA{152, 251, 152, 255} // Pale Green

	// Draw rectangles
	draw.Draw(img, image.Rect(0, 0, 833, height), &image.Uniform{col1}, image.Point{}, draw.Src)
	draw.Draw(img, image.Rect(833, 0, 1666, height), &image.Uniform{col2}, image.Point{}, draw.Src)
	draw.Draw(img, image.Rect(1666, 0, 2500, height), &image.Uniform{col3}, image.Point{}, draw.Src)

	// Save to file
	f, err := os.Create("../assets/richmenu/menu_b.png")
	if err != nil {
		panic(err)
	}
	defer f.Close()
	png.Encode(f, img)
}
