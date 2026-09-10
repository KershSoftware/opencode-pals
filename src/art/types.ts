export type Mood = 'idle' | 'thinking' | 'working' | 'waiting' | 'done' | 'error' | 'interrupted'
export type Pixel = string | null // opaque #rrggbb or transparent
export type Frame = { width: number; height: number; pixels: Pixel[] }
export type Appearance = { character: string; skin: string; hat: string }
export type Pose = { dy: number; eyeDx: number; blink: boolean; mood: Mood }
export type Skin = { id: string; name: string; palette: Record<string, string> }
export type Hat = {
  id: string; name: string
  draw(pose: Pose, anchor: { x: number; y: number }): Frame
}
export type Character = {
  id: string; name: string; skins: Skin[]; hats: string[]
  defaults: { skin: string; hat: string }
  anchor: { x: number; y: number }
  bounds: { x: number; y: number; width: number; height: number }
  draw(pose: Pose, skin: Skin): Frame
}
export type Catalog = { characters: Character[]; hats: Hat[] }
