import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { momentsApi } from '../../src/api/endpoints';
import { colors, typography, radii, spacing } from '../../src/theme';
import { Button, Toast } from '../../src/components/ui';

export default function CreateMomentScreen() {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => momentsApi.createMoment(body.trim(), mediaUri || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moments'] });
      router.back();
    },
    onError: (err: any) => {
      setToastMessage(err?.message || 'Failed to post moment');
    },
  });

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera roll permissions are required to select photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setMediaUri(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Camera permissions are required to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setMediaUri(result.assets[0].uri);
    }
  };

  const handlePost = () => {
    if (!body.trim() && !mediaUri) {
      setToastMessage('Please write something or attach a photo');
      return;
    }
    createMutation.mutate();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Toast message={toastMessage} onHide={() => setToastMessage(null)} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Moment</Text>
        <Button
          title="Post"
          variant="gold"
          size="sm"
          loading={createMutation.isPending}
          onPress={handlePost}
          disabled={!body.trim() && !mediaUri}
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <TextInput
            style={styles.input}
            placeholder="Share what is happening right now..."
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
            multiline
            numberOfLines={6}
            value={body}
            onChangeText={setBody}
            maxLength={1000}
          />

          {/* Media preview */}
          {mediaUri ? (
            <View style={styles.mediaContainer}>
              <Image source={{ uri: mediaUri }} style={styles.mediaPreview} />
              <TouchableOpacity
                style={styles.removeMediaBtn}
                onPress={() => setMediaUri(null)}
              >
                <Text style={styles.removeMediaText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.mediaActionsRow}>
              <TouchableOpacity style={styles.mediaActionBtn} onPress={pickImage}>
                <Text style={styles.mediaActionEmoji}>🖼️</Text>
                <Text style={styles.mediaActionText}>Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.mediaActionBtn} onPress={takePhoto}>
                <Text style={styles.mediaActionEmoji}>📸</Text>
                <Text style={styles.mediaActionText}>Camera</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07090E',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  backBtn: {
    padding: spacing.xs,
  },
  cancelText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: typography.sizes.sm,
  },
  headerTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: '#FFFFFF',
  },
  content: {
    padding: spacing.md,
  },
  input: {
    color: '#FFFFFF',
    fontSize: typography.sizes.md,
    lineHeight: 24,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  mediaContainer: {
    marginTop: spacing.md,
    position: 'relative',
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  mediaPreview: {
    width: '100%',
    height: 260,
    borderRadius: radii.md,
  },
  removeMediaBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeMediaText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  mediaActionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  mediaActionBtn: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaActionEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  mediaActionText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
  },
});

