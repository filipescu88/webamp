import WebampLazy from "../../webamp/js/webampLazy";
// @ts-ignore
import iconSmall from "../images/icons/paint-file-32x32.png";
import DesktopIcon from "./DesktopIcon";

const iconUrl = iconSmall;

interface Props {
  webamp: WebampLazy;
  skin: { url: string; name: string };
}

const SkinIcon = ({ webamp, skin }: Props) => {
  function onOpen() {
    webamp.setSkinFromUrl(skin.url);
  }
  return (
    <DesktopIcon iconUrl={iconUrl} name={`${skin.name}.wsz`} onOpen={onOpen} />
  );
};

export default SkinIcon;
