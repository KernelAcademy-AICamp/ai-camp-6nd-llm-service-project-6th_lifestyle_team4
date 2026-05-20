class Genre {
  final int genreId;
  final String code;
  final String nameKo;

  const Genre({
    required this.genreId,
    required this.code,
    required this.nameKo,
  });

  factory Genre.fromMap(Map<String, dynamic> map) => Genre(
        genreId: (map['genre_id'] as num).toInt(),
        code: map['code'] as String,
        nameKo: map['name_ko'] as String,
      );
}
