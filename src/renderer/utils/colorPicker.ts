/**
 * Purpose: Shared request contract for opening the ColorPickerModal from any color control.
 */
export interface ColorPickerOpenRequest {
  initialColor: string;
  onPreview?: (color: string) => void;
  onApply: (color: string) => void;
  onCancel?: () => void;
}
