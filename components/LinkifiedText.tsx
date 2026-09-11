import { Linking, Text, TextStyle } from 'react-native';

// Same regex/splitting approach as qubeex-web's LinkifiedText — split() with a
// capturing group interleaves matched URLs at odd indices, plain text at even.
const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;

interface LinkifiedTextProps {
    text: string;
    style?: TextStyle | TextStyle[];
    linkStyle?: TextStyle;
    numberOfLines?: number;
    onPress?: () => void;
}

export function LinkifiedText({ text, style, linkStyle, numberOfLines, onPress }: LinkifiedTextProps) {
    const parts = text.split(URL_REGEX);

    return (
        <Text style={style} numberOfLines={numberOfLines} onPress={onPress} suppressHighlighting={!!onPress}>
            {parts.map((part, i) => {
                const isUrl = i % 2 === 1;
                if (!isUrl) return part;
                const href = part.startsWith('www.') ? `https://${part}` : part;
                return (
                    <Text
                        key={i}
                        style={linkStyle ?? { color: '#7C3AED', textDecorationLine: 'underline' }}
                        onPress={() => Linking.openURL(href).catch(() => {})}
                    >
                        {part}
                    </Text>
                );
            })}
        </Text>
    );
}
